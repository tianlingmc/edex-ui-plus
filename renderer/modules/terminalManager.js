// 多终端管理器：支持标签页创建/切换/关闭、cd 同步、WebGL 渲染、忙检测、shell 类型选择
// 通过 JSON 协议 WebSocket 与主进程多 pty 通信

import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { resolveCdPath } from './filesystem.js'
import { t } from '../locale.js'
import { Modal } from './modal.js'

let instance = null
const SHELL_LABELS = {
  powershell: 'PS',
  pwsh: 'P7',
  git: 'GIT',
  bash: 'BASH'
}

export function getTerminalManager() { return instance }

export class TerminalManager {
  constructor({ termTheme }) {
    instance = this
    this._terms = new Map()
    this._orderedIds = []
    this._currentId = null
    this._ws = null
    this._shells = []
    this._pendingCreates = [] // WS 未就绪时排队

    // cd 同步
    this._cdLine = ''
    this._cdCwd = null
    this._cdRe = /^\s*cd\b\s*(.*)$/i
    window.addEventListener('fs-cwd-changed', (e) => {
      if (e.detail && e.detail.cwd) this._cdCwd = e.detail.cwd
    })
    try { window.eDEX.fsGetHome().then((h) => { if (!this._cdCwd) this._cdCwd = h }).catch(() => {}) } catch (_) {}

    // 忙检测
    this._lastActivity = 0

    // xterm 配置
    this._settings = {} // 初始空值，连接完成后更新
    window.eDEX.readSettings().then((r) => {
      this._settings = r.settings || {}
    }).catch(() => {
      this._settings = {}
    })
    // 设置页面保存后热重载
    window.addEventListener('settings-hot-reload', (e) => {
      if (e.detail) this._settings = e.detail
    })

    const { fontFamily, cursorStyle, ...xtermColors } = termTheme
    this._xtermOpts = {
      fontSize: 15, cursorBlink: true,
      fontFamily: fontFamily || 'Fira Mono',
      cursorStyle: cursorStyle || 'block',
      theme: xtermColors
    }

    this._initTabs()
    this._connect()
  }

  isBusy() { return (Date.now() - this._lastActivity) < 5000 }

  // ==================== WebSocket ====================

  _connect() {
    this._ws = new WebSocket('ws://localhost:3000')
    this._ws.onopen = () => {
      // 发起 IPC 获取可用 shell
      window.eDEX.getAvailableShells().then((r) => {
        this._shells = (r && r.shells) || []
        if (!this._shells.length) this._shells = [{ id: 'powershell', label: 'PowerShell', bin: 'powershell.exe' }]
      }).catch(() => {
        this._shells = [{ id: 'powershell', label: 'PowerShell', bin: 'powershell.exe' }]
      })
      // 创建初始终端（PowerShell）
      this._send({ type: 'create', cols: 80, rows: 24, shell: 'powershell' })
      // 清空排队队列
      const q = this._pendingCreates.splice(0)
      q.forEach((m) => this._send(m))
    }

    this._ws.onmessage = (ev) => {
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      const { termId, type, data, shell } = msg

      if (type === 'shells') {
        // 服务端消息 key 为 shells（带 s），用 shells 而不是 shell 解构
        this._shells = msg.shells || []
        return
      }

      if (type === 'created') {
        this._initTerm(termId, shell || 'powershell')
        this._orderedIds.push(termId)
        this._switchTo(termId)
        this._updateTabs()
        return
      }

      if (type === 'output') {
        const t = this._terms.get(termId)
        if (t) {
          t.xterm.write(data)
          if (!data || data.length >= 10) return
          const d = data.replace(/\x1b\[[\d;]*[a-zA-Z]/g, '').trim()
          if (d.endsWith('>') || d.endsWith('$') || d.endsWith('#') || /^[A-Za-z]:\\/.test(d)) {
            this._lastActivity = 0
          }
        }
        return
      }

      if (type === 'exit') {
        const t = this._terms.get(termId)
        if (t) t.xterm.write('\r\n\x1b[1;31m[terminal closed]\x1b[0m\r\n')
      }

      if (type === 'spawn_error') {
        new Modal({ type: 'error', title: '创建终端失败', message: data || 'Unknown error' })
      }
    }
    this._ws.onerror = () => {}
    this._ws.onclose = () => {}
  }

  _send(msg) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      this._pendingCreates.push(msg)
      return
    }
    try { this._ws.send(JSON.stringify(msg)) } catch {}
  }

  // ==================== xterm 实例 ====================

  _initTerm(termId, shellType) {
    if (this._terms.has(termId)) return
    const container = document.getElementById('terminal')
    const wrapper = document.createElement('div')
    wrapper.className = 'xterm-wrapper'
    wrapper.style.cssText = 'width:100%;height:100%;display:none'
    container.appendChild(wrapper)

    const xterm = new Terminal(this._xtermOpts)
    const fit = new FitAddon()
    xterm.loadAddon(fit)
    xterm.open(wrapper)
    fit.fit()

    const ta = xterm.textarea
    if (ta) {
      ta.setAttribute('inputmode', 'none')
      ta.setAttribute('lang', 'en')
      ta.setAttribute('autocomplete', 'off')
      ta.setAttribute('autocorrect', 'off')
      ta.setAttribute('autocapitalize', 'off')
      ta.setAttribute('spellcheck', 'false')
    }

    this._terms.set(termId, { xterm, fit, wrapper, shell: shellType || 'powershell', cols: xterm.cols, rows: xterm.rows })

    xterm.onResize(({ cols: c, rows: r }) => {
      const t = this._terms.get(termId)
      if (t) { t.cols = c; t.rows = r }
      this._send({ termId, type: 'resize', cols: c, rows: r })
    })

    // 始终为每个终端挂载数据转发 + cd 同步
    this._setupCdSync(xterm, termId)

    try { xterm.loadAddon(new WebglAddon()) } catch (_) {}
  }

  _setupCdSync(xterm, termId) {
    xterm.onData((data) => {
      this._lastActivity = Date.now()
      // 转发按键到对应的 pty（每个终端独立 termId，自己的按键发给自己）
      this._send({ termId, type: 'input', data })

      if (data === '\r' || data === '\n' || /[\r\n]/.test(data)) {
        const cmd = (this._cdLine || '').replace(/[\r\n]+/g, '').trim()
        this._cdLine = ''
        const m = cmd.match(this._cdRe)
        if (m && this._cdCwd) {
          const raw = m[1].trim().replace(/^\/d\s+/i, '').replace(/^["']|["']$/g, '')
          const abs = resolveCdPath(raw, this._cdCwd, window.eDEX.platform)
          if (abs) {
            this._cdCwd = abs
            window.dispatchEvent(new CustomEvent('fs-cd-sync', { detail: { target: abs } }))
          }
        }
        return
      }
      if (data === '\u007F' || data === '\b') { this._cdLine = (this._cdLine || '').slice(0, -1); return }
      if (data.charCodeAt(0) === 27) return
      if (data < ' ') return
      this._cdLine = (this._cdLine || '') + data
    })
  }

  // ==================== 标签页管理 ====================

  createTerminal() {
    if (this._orderedIds.length >= 6) return
    const prompt = this._settings.newTermPrompt !== false // 默认 true
    if (prompt) {
      this._showNewTerminalModal()
    } else {
      // 直接创建默认终端
      const defaultShell = this._settings.defaultTermShell || ''
      const shell = defaultShell || (this._shells.length ? this._shells[0].id : 'powershell')
      this._send({ type: 'create', cols: 80, rows: 24, shell })
    }
  }

  /** 弹出新建终端类型选择框 */
  _showNewTerminalModal() {
    const old = document.getElementById('new-term-overlay')
    if (old) old.remove()

    const overlay = document.createElement('div')
    overlay.id = 'new-term-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;animation:escIn .15s ease;'

    const bg = document.createElement('div')
    bg.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);'

    const card = document.createElement('div')
    card.style.cssText = 'position:relative;background:var(--color_light_black,#0b0e14);border:0.12vh solid rgb(var(--color_r),var(--color_g),var(--color_b));padding:2.5vh 2.5vw;text-align:center;clip-path:polygon(0.6vh 0,100% 0,100% 100%,0 100%,0 0.6vh);animation:cardIn .2s ease;min-width:18vw;'

    const title = document.createElement('h2')
    title.textContent = t('new_term_title') || 'NEW TERMINAL'
    title.style.cssText = 'font-size:1.6vh;margin:0 0 1.5vh 0;letter-spacing:0.2vw;color:rgb(var(--color_r),var(--color_g),var(--color_b));'
    card.appendChild(title)

    // 可用 shell 按钮
    const shells = this._shells.length ? this._shells : [{ id: 'powershell', label: 'PowerShell', bin: 'powershell.exe' }]
    shells.forEach((s) => {
      const btn = document.createElement('button')
      btn.textContent = s.label
      btn.style.cssText = 'display:block;width:100%;padding:0.8vh 1vw;margin-bottom:0.6vh;background:transparent;color:rgb(var(--color_r),var(--color_g),var(--color_b));border:0.08vh solid rgba(var(--color_r),var(--color_g),var(--color_b),0.3);font-size:1.3vh;font-family:var(--font_main);cursor:pointer;letter-spacing:0.1vw;transition:all .1s ease;text-align:center;'
      btn.onmouseenter = () => { btn.style.background = 'rgba(var(--color_r),var(--color_g),var(--color_b),0.12)'; btn.style.borderColor = 'rgb(var(--color_r),var(--color_g),var(--color_b))' }
      btn.onmouseleave = () => { btn.style.background = 'transparent'; btn.style.borderColor = 'rgba(var(--color_r),var(--color_g),var(--color_b),0.3)' }
      btn.onclick = () => {
        overlay.remove()
        this._send({ type: 'create', cols: 80, rows: 24, shell: s.id })
      }
      card.appendChild(btn)
    })

    const hint = document.createElement('span')
    hint.textContent = t('menu_esc') || 'ESC TO CLOSE'
    hint.style.cssText = 'font-size:0.9vh;opacity:0.3;margin-top:0.8vh;display:block;'
    card.appendChild(hint)

    overlay.appendChild(bg)
    overlay.appendChild(card)
    document.body.appendChild(overlay)

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        overlay.remove()
        document.removeEventListener('keydown', keyHandler, true)
      }
    }
    document.addEventListener('keydown', keyHandler, true)
    overlay._keyHandler = keyHandler
  }

  // ==================== 标签页管理 ====================

  _initTabs() {
    const container = document.getElementById('main_shell_tabs')
    if (!container) return
    // 初始清空，所有标签由 _updateTabs 管理
    container.innerHTML = ''
  }

  _switchTo(termId) {
    this._terms.forEach((t, id) => {
      t.wrapper.style.display = id === termId ? 'block' : 'none'
    })
    this._currentId = termId
    // 更新 tab 激活态
    const container = document.getElementById('main_shell_tabs')
    if (container) {
      const lis = container.querySelectorAll('li')
      lis.forEach((li) => {
        if (li._termId) {
          li.className = (li._termId === termId) ? 'active' : ''
        } else {
          // 保留空的 EMPTY 样式（.empty 类仅由 _updateTabs 设置）
          li.className = (li.classList.contains('empty')) ? 'empty' : ''
        }
      })
    }
    // 延迟执行 fit（等 display 生效）
    const t = this._terms.get(termId)
    if (t) setTimeout(() => { try { t.fit.fit() } catch (_) {} }, 50)
  }

  _updateTabs() {
    const container = document.getElementById('main_shell_tabs')
    if (!container) return
    // 清空所有 tab
    container.innerHTML = ''
    // 如果当前没选中任何终端但有已创建的，选中第一个
    if (!this._currentId && this._orderedIds.length) {
      this._switchTo(this._orderedIds[0])
    }
    // 为每个有序 ID 创建 tab
    this._orderedIds.forEach((id, idx) => {
      const info = this._terms.get(id)
      const isFirst = (idx === 0)  // 第一个终端显示 MAIN
      const label = isFirst ? 'MAIN' : ((info && info.shell && SHELL_LABELS[info.shell]) || 'PS')
      const li = document.createElement('li')
      li._termId = id
      const p = document.createElement('p')
      p.textContent = isFirst ? 'MAIN' : (label + ' ' + (idx + 1))
      li.appendChild(p)
      li.addEventListener('click', () => { if (this._currentId !== id) this._switchTo(id) })
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        if (this._orderedIds.length > 1 && idx > 0) {
          const confirm = this._settings.closeTermPrompt !== false // 默认 true
          if (confirm) {
            this._showCloseConfirm(id)
          } else {
            this._closeTerminalById(id)
          }
        }
      })
      container.appendChild(li)
    })
    // 补 EMPTY 占位到 6 个
    const total = container.children.length
    for (let i = total; i < 6; i++) {
      const empty = document.createElement('li')
      empty.className = 'empty'
      const p = document.createElement('p')
      p.textContent = 'EMPTY'
      empty.appendChild(p)
      empty.addEventListener('click', () => this.createTerminal())
      container.appendChild(empty)
    }
    // 重建后同步激活态：给当前选中的 tab 加 active 类
    if (this._currentId) {
      const lis = container.querySelectorAll('li')
      lis.forEach((li) => {
        if (li._termId === this._currentId) li.className = 'active'
      })
    }
  }

  _showCloseConfirm(termId) {
    const overlay = document.createElement('div')
    overlay.id = 'new-term-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;animation:escIn .15s ease;'
    const bg = document.createElement('div')
    bg.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);'
    overlay.appendChild(bg)
    const card = document.createElement('div')
    card.style.cssText = 'position:relative;background:var(--color_light_black,#0b0e14);border:0.12vh solid rgb(var(--color_r),var(--color_g),var(--color_b));padding:2.5vh 2.5vw;text-align:center;clip-path:polygon(0.6vh 0,100% 0,100% 100%,0 100%,0 0.6vh);animation:cardIn .2s ease;min-width:16vw;'
    const title = document.createElement('h2')
    title.textContent = t('close_term_title') || 'CLOSE TERMINAL'
    title.style.cssText = 'font-size:1.6vh;margin:0 0 1vh 0;letter-spacing:0.2vw;color:rgb(var(--color_r),var(--color_g),var(--color_b));'
    card.appendChild(title)
    const desc = document.createElement('p')
    desc.textContent = t('close_term_desc') || 'Are you sure?'
    desc.style.cssText = 'font-size:1.2vh;opacity:0.6;margin:0 0 1.5vh 0;'
    card.appendChild(desc)
    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:0.5vw;justify-content:center;'
    const yesBtn = document.createElement('button')
    yesBtn.textContent = t('yes') || 'YES'
    yesBtn.style.cssText = 'padding:0.6vh 1.2vw;background:rgba(230,60,60,0.15);color:rgb(230,60,60);border:0.08vh solid rgb(230,60,60);font-size:1.2vh;cursor:pointer;font-family:var(--font_main);'
    yesBtn.onclick = () => { overlay.remove(); this._closeTerminalById(termId) }
    const noBtn = document.createElement('button')
    noBtn.textContent = t('busy_cancel') || 'CANCEL'
    noBtn.style.cssText = 'padding:0.6vh 1.2vw;background:transparent;color:rgb(var(--color_r),var(--color_g),var(--color_b));border:0.08vh solid rgba(var(--color_r),var(--color_g),var(--color_b),0.3);font-size:1.2vh;cursor:pointer;font-family:var(--font_main);'
    noBtn.onclick = () => overlay.remove()
    btnRow.appendChild(yesBtn); btnRow.appendChild(noBtn)
    card.appendChild(btnRow)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    const keyHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); overlay.remove(); document.removeEventListener('keydown', keyHandler, true) }
    }
    document.addEventListener('keydown', keyHandler, true)
  }

  _closeTerminalById(termId) {
    // 第一个终端（MAIN）不可删除
    if (this._orderedIds.indexOf(termId) === 0) return
    const t = this._terms.get(termId)
    if (t) {
      t.wrapper.remove()
      this._terms.delete(termId)
    }
    this._send({ termId, type: 'close' })
    this._orderedIds = this._orderedIds.filter((id) => id !== termId)
    // 切换到最后一个
    if (this._currentId === termId && this._orderedIds.length) {
      this._switchTo(this._orderedIds[this._orderedIds.length - 1])
    }
    this._updateTabs()
  }

  setFontSize(size) {
    this._terms.forEach((t) => { try { t.xterm.setOption('fontSize', size); t.fit.fit() } catch {} })
  }

  sendInput(data) {
    if (this._currentId) this._send({ termId: this._currentId, type: 'input', data })
  }

  // 焦点当前终端
  focus() {
    const t = this._terms.get(this._currentId)
    if (t && t.xterm && t.xterm.textarea) {
      try { t.xterm.textarea.focus() } catch (_) {}
    }
  }

  // 获取当前 xterm 实例（供其他模块使用 xterm API）
  getCurrentTerm() {
    return this._terms.get(this._currentId)
  }

  // 调整所有终端大小（窗口 resize 时调用）
  resize() {
    this._terms.forEach((t) => { try { t.fit.fit() } catch (_) {} })
  }
}
