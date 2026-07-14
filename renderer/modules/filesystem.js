import { esc } from '../ui.js'
import { Modal } from './modal.js'
import { openMedia } from './mediaPlayer.js'
import { openDoc } from './docReader.js'
import matchIcon from '../assets/misc/file-icons-match.js'

const ICON_FILL = 'rgb(var(--color_r), var(--color_g), var(--color_b))'

export function resolveCdPath(target, cwd, platform) {
  const sep = platform === 'win32' ? '\\' : '/'
  const t = (target || '').trim().replace(/^\/d\s+/i, '').replace(/^["']|["']$/g, '')
  if (!t) return cwd
  if (/^[A-Za-z]:/.test(t) || t.startsWith('/') || t.startsWith('\\')) {
    const abs = t.replace(/\/+/g, sep)
    return /^[A-Za-z]:$/.test(abs) ? abs + sep : abs
  }
  const stack = []
  ;(cwd + sep + t).split(/[\\/]+/).filter(Boolean).forEach((p) => {
    if (p === '.') return
    if (p === '..') {
      if (stack.length && !/^[A-Za-z]:$/.test(stack[stack.length - 1])) stack.pop()
      return
    }
    stack.push(p)
  })
  let res = stack.join(sep)
  if (/^[A-Za-z]:$/.test(res)) res += sep
  return res
}

export class Filesystem {
  constructor(parentId) {
    this.container = document.getElementById('fs_disp_container')
    this.titleEl = document.getElementById('fs_disp_title_dir')
    this.spaceText = document.querySelector('#fs_space_bar > h3')
    this.spaceBar = document.querySelector('#fs_space_bar > progress')
    this.home = null
    this.cwd = null
    this.history = []
    this._histIdx = -1
    this.icons = null
    this._loading = false
    this._pendingTarget = null // cd 队列缓冲：loading 时暂存最新目标，加载完成后自动触发
    this._historyNav = false // 防止前进/后退时重复记录历史

    this.init()

    // 全局快捷键
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'H') { e.preventDefault(); if (this.home) this.navigate(this.home) }
      if (e.ctrlKey && e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); this.historyBack() }
      if (e.ctrlKey && e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); this.historyForward() }
      if (e.ctrlKey && e.key === 'r') { e.preventDefault(); if (this.cwd) this.navigate(this.cwd) }
    })

    // 全局点击关闭右键菜单
    window.addEventListener('click', () => this.hideContextMenu())

    // 终端 cd 命令接收（事件驱动）：_loading 时缓存，加载完成后自动跳转，不丢失指令
    window.addEventListener('fs-cd-sync', (e) => {
      if (!this.cwd) return
      const target = this.resolveCd(e.detail && e.detail.target)
      if (this._loading) { this._pendingTarget = target; return }
      this.navigate(target)
    })

    // === 事件委托（单监听器替代每文件 3N 个）===
    // 单击：导航（不打开文件，避免单击误触；文件用 dblclick 打开）
    this.container.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-type]')
      if (!el) return
      const type = el.getAttribute('data-type')
      const path = el.getAttribute('data-path')
      if (type === 'showDisks') { this.readDevices(); return }
      if (type === 'up') { this.goUp(); return }
      if (type === 'dir' || type === 'disk' || type === 'rom' || type === 'usb') {
        if (path) this.navigate(path)
      }
    })

    // 双击：文件打开预览
    this.container.addEventListener('dblclick', (ev) => {
      const el = ev.target.closest('[data-type]')
      if (!el) return
      if (el.getAttribute('data-type') === 'file') {
        const ne = el.querySelector('h3')
        if (ne) this.openFile(ne.textContent)
      }
    })

    // 右键菜单
    this.container.addEventListener('contextmenu', (ev) => {
      const el = ev.target.closest('[data-type]')
      if (!el) return
      ev.preventDefault()
      this.showContextMenu(ev, el)
    })
  }

  async init() {
    try {
      this.icons = (await import('../assets/icons/file-icons.json')).default
      this.home = await window.eDEX.fsGetHome()
      this.cwd = this.home
      await this.navigate(this.cwd)
      this._histIdx = 0
    } catch (e) {
      console.error('[fs] init failed:', e)
      this.container.innerHTML = `<div class="fs_disp_file" style="grid-column:1/-1"><h3>fs init error: ${esc((e && e.message) || String(e))}</h3></div>`
    }
  }

  iconFor(entry) {
    if (!this.icons) return { svg: '', width: 24, height: 24 }
    let key
    if (entry.type === 'dir') key = 'dir'
    else if (entry.type === 'symlink') key = 'symlink'
    else if (entry.type === 'up') key = 'up'
    else if (entry.type === 'showDisks') key = 'showDisks'
    else if (entry.type === 'disk' || entry.type === 'rom' || entry.type === 'usb') key = entry.type
    else key = this.icons[matchIcon(entry.name)] ? matchIcon(entry.name) : 'file'
    return this.icons[key] || this.icons['file'] || { svg: '', width: 24, height: 24 }
  }

  typeLabel(entry) {
    if (entry.type === 'dir') return 'folder'
    if (entry.type === 'symlink') return 'symlink'
    if (entry.type === 'up' || entry.type === 'showDisks') return '--'
    if (entry.type === 'disk' || entry.type === 'rom' || entry.type === 'usb') return entry.type
    return matchIcon(entry.name) || 'file'
  }

  _formatBytes(a) {
    if (!a || a <= 0) return '--'
    const c = 1024; const e = ['B', 'KB', 'MB', 'GB', 'TB']
    const f = Math.floor(Math.log(a) / Math.log(c))
    return parseFloat((a / Math.pow(c, f)).toFixed(1)) + ' ' + e[f]
  }

  _formatDate(ms) {
    if (!ms) return '--'
    try { return new Date(ms).toLocaleDateString() } catch { return '--' }
  }

  async navigate(target) {
    if (!target) return
    // cd 队列缓冲：loading 时暂存最新目标，由当前加载完成后自动触发
    if (this._loading) { this._pendingTarget = target; return }
    this._loading = true

    const sep = window.eDEX.platform === 'win32' ? '\\' : '/'
    // 记录历史（排除重复导航 + 前进/后退操作）
    if (this.cwd && target !== this.cwd && !this._historyNav) {
      if (this._histIdx < this.history.length - 1) this.history = this.history.slice(0, this._histIdx + 1)
      this.history.push(target)
      this._histIdx = this.history.length - 1
    }
    this._historyNav = false
    this.cwd = target
    this.renderBreadcrumb(target)

    try {
      const entries = await window.eDEX.fsReadDir(this.cwd)
      const order = { dir: 0, symlink: 1, file: 2, disk: 3, rom: 4, usb: 5, other: 6 }
      const norm = (e) => ({
        name: e.name,
        type: e.isSymlink ? 'symlink' : e.isDir ? 'dir' : 'file',
        category: e.isDir ? 'dir' : (e.isSymlink ? 'symlink' : 'file'),
        size: e.size || 0,
        mtime: e.mtime || 0,
        path: this.cwd + sep + e.name
      })
      const items = entries.map(norm)
      items.sort((a, b) => (order[a.category] - order[b.category]) || a.name.localeCompare(b.name))

      const prefix = [
        { name: 'Show disks', type: 'showDisks', category: 'showDisks', size: 0, mtime: 0, path: null }
      ]
      if (this.cwd !== this.home) prefix.push({ name: 'Go up', type: 'up', category: 'up', size: 0, mtime: 0, path: null })
      this.render(prefix.concat(items), false)
      this.updateSpace(this.cwd)
      window.dispatchEvent(new CustomEvent('fs-cwd-changed', { detail: { cwd: this.cwd } }))
    } catch (err) {
      this.container.innerHTML = `<div class="fs_disp_file" style="grid-column:1/-1"><h3>${esc(err.message)}</h3></div>`
    }

    this._loading = false
    // 检查加载期间是否有新的 cd 请求
    if (this._pendingTarget) {
      const t = this._pendingTarget
      this._pendingTarget = null
      this.navigate(t)
    }
  }

  historyBack() {
    if (this._histIdx > 0 && this.history.length) {
      this._histIdx--
      this._historyNav = true
      this.navigate(this.history[this._histIdx])
    }
  }

  historyForward() {
    if (this._histIdx < this.history.length - 1) {
      this._histIdx++
      this._historyNav = true
      this.navigate(this.history[this._histIdx])
    }
  }

  async readDevices() {
    try {
      const devices = await window.eDEX.fsListDrives()
      const items = devices.map((d, i) => ({
        name: d.name,
        type: d.type,
        category: d.type,
        size: 0,
        mtime: 0,
        path: d.path
      }))
      this.render(items, true)
      if (this.titleEl) this.titleEl.textContent = 'Showing available block devices'
    } catch (e) {
      this.container.innerHTML = `<div class="fs_disp_file" style="grid-column:1/-1"><h3>${esc(e.message)}</h3></div>`
    }
  }

  render(items, isDiskView) {
    this.container.setAttribute('class', isDiskView ? 'disks' : '')
    let html = ''
    items.forEach((e, i) => {
      const icon = this.iconFor(e)
      const cls = 'fs_disp_' + e.type
      const type = this.typeLabel(e)
      const size = this._formatBytes(e.size)
      const date = this._formatDate(e.mtime)
      html += `<div class="${cls}" data-path="${e.path ? esc(e.path) : ''}" data-type="${e.type}" style="--i:${i}">
        <svg viewBox="0 0 ${icon.width} ${icon.height}" style="fill:${ICON_FILL}">${icon.svg}</svg>
        <h3 title="${esc(e.name)}">${esc(e.name)}</h3>
        <h4>${esc(type)}</h4>
        <h4>${esc(size)}</h4>
        <h4>${esc(date)}</h4>
      </div>`
    })
    this.container.innerHTML = html

    // 空间条点击：磁盘视图下返回当前目录
    const sb = document.getElementById('fs_space_bar')
    if (sb) sb.onclick = isDiskView ? () => this.navigate(this.cwd) : null

    // 触发入场动画
    requestAnimationFrame(() => {
      Array.from(this.container.children).forEach((el, i) => {
        el.style.setProperty('--i', String(i))
      })
    })
  }

  renderBreadcrumb(path) {
    if (!this.titleEl) return
    const sep = window.eDEX.platform === 'win32' ? '\\' : '/'
    const segs = (path || '').split(/[\\/]+/).filter(Boolean)
    if (segs.length === 0) { this.titleEl.innerHTML = ''; return }
    let acc = segs[0]
    const crumbs = [{ label: segs[0], fullPath: segs[0].endsWith(':') ? segs[0] + sep : segs[0] }]
    for (let i = 1; i < segs.length; i++) {
      acc += sep + segs[i]
      crumbs.push({ label: segs[i], fullPath: acc })
    }
    this.titleEl.innerHTML = crumbs
      .map((c, i) => `${i ? `<span class="fs_crumb_sep">${esc(sep)}</span>` : ''}<span class="fs_crumb" data-path="${esc(c.fullPath)}">${esc(c.label)}</span>`)
      .join('')
    this.titleEl.querySelectorAll('.fs_crumb').forEach((el) => {
      el.addEventListener('click', () => this.navigate(el.getAttribute('data-path')))
    })
  }

  goUp() {
    if (!this.cwd) { this.readDevices(); return }
    const up = resolveCdPath('..', this.cwd, window.eDEX.platform)
    if (up === this.cwd) { this.readDevices(); return }
    this.navigate(up)
  }

  resolveCd(target) { return resolveCdPath(target, this.cwd, window.eDEX.platform) }

  async updateSpace(cwd) {
    try {
      const block = await window.eDEX.fsGetSpace(cwd)
      if (!block || !block.size) {
        if (this.spaceText) this.spaceText.textContent = '\u2014'
        if (this.spaceBar) this.spaceBar.removeAttribute('value')
        return
      }
      const use = (typeof block.use === 'number' && !isNaN(block.use))
        ? Math.round(block.use)
        : Math.round((block.used / block.size) * 100)
      const splitter = window.eDEX.platform === 'win32' ? '\\' : '/'
      const dispMount = block.mount.length < 18 ? block.mount : '...' + splitter + block.mount.split(splitter).pop()
      if (this.spaceText) this.spaceText.innerHTML = `Mount <strong>${esc(dispMount)}</strong> used <strong>${use}%</strong>`
      if (this.spaceBar) this.spaceBar.value = use
    } catch (_) {
      if (this.spaceText) this.spaceText.textContent = 'Could not calculate mountpoint usage.'
      if (this.spaceBar) this.spaceBar.value = 100
    }
  }

  showContextMenu(ev, el) {
    this.hideContextMenu()
    const type = el.getAttribute('data-type')
    const path = el.getAttribute('data-path')
    const name = el.querySelector('h3') ? el.querySelector('h3').textContent : ''
    if (!path && type !== 'showDisks' && type !== 'up') return

    const acts = []
    if (type === 'dir' || type === 'disk' || type === 'rom' || type === 'usb') {
      acts.push(
        { act: 'open', label: '打开' },
        { act: 'explorer', label: '在资源管理器打开' },
        { act: 'cdhere', label: '终端 cd 到此处' },
        { act: 'refresh', label: '刷新' }
      )
    } else if (type === 'file') {
      acts.push(
        { act: 'open', label: '打开' },
        { act: 'explorer', label: '在资源管理器打开' },
        { act: 'copy', label: '复制路径' },
        { act: 'refresh', label: '刷新' }
      )
    } else if (type === 'up') {
      acts.push({ act: 'up', label: '上级目录' })
    } else if (type === 'showDisks') {
      acts.push({ act: 'disks', label: '磁盘视图' })
    }

    const menu = document.createElement('div')
    menu.id = 'fs_ctx_menu'
    menu.innerHTML = acts.map((a) => `<div class="fs_ctx_item" data-act="${a.act}">${esc(a.label)}</div>`).join('')
    // 边界检测：菜单不超出视口
    const mx = ev.clientX, my = ev.clientY
    menu.style.left = mx + 'px'
    menu.style.top = my + 'px'
    document.body.appendChild(menu)
    // 如果菜单超出右侧，向左弹
    requestAnimationFrame(() => {
      const mr = menu.getBoundingClientRect()
      if (mr.right > window.innerWidth) menu.style.left = (window.innerWidth - mr.width - 8) + 'px'
      if (mr.bottom > window.innerHeight) menu.style.top = (window.innerHeight - mr.height - 8) + 'px'
    })

    menu.querySelectorAll('.fs_ctx_item').forEach((mi) => {
      mi.addEventListener('click', (e) => {
        e.stopPropagation()
        const act = mi.getAttribute('data-act')
        this.hideContextMenu()
        switch (act) {
          case 'open':
            if (type === 'dir' || type === 'disk' || type === 'rom' || type === 'usb') this.navigate(path)
            else if (type === 'file') this.openFile(name)
            else if (type === 'up') this.goUp()
            else if (type === 'showDisks') this.readDevices()
            break
          case 'explorer':
            window.eDEX.fsOpenInExplorer(path, type === 'dir' || type === 'disk' || type === 'rom' || type === 'usb')
            break
          case 'cdhere':
            if (path) {
              window.dispatchEvent(new CustomEvent('fs-terminal-cd', { detail: { path } }))
              window.dispatchEvent(new CustomEvent('fs-cd-sync', { detail: { target: path } }))
            }
            break
          case 'copy':
            if (navigator.clipboard) navigator.clipboard.writeText(path).catch(() => {})
            break
          case 'up': this.goUp(); break
          case 'disks': this.readDevices(); break
          case 'refresh': if (this.cwd) this.navigate(this.cwd); break
        }
      })
    })
  }

  hideContextMenu() {
    const m = document.getElementById('fs_ctx_menu')
    if (m) m.remove()
  }

  typeOf(name) {
    const ext = (/\.([^.]+)$/.exec(name) || [,''])[1].toLowerCase()
    const img = ['png','jpg','jpeg','gif','bmp','webp','svg','ico']
    const aud = ['mp3','wav','ogg','flac','m4a','aac','opus']
    const vid = ['mp4','webm','mkv','mov','avi','m4v']
    const txt = ['txt','md','markdown','json','js','mjs','cjs','ts','css','html','htm','log','csv','xml','yml','yaml','ini','toml','sh','py','go','rs','java','c','cpp','h','hpp']
    if (img.includes(ext)) return 'image'
    if (aud.includes(ext)) return 'audio'
    if (vid.includes(ext)) return 'video'
    if (ext === 'pdf') return 'pdf'
    if (txt.includes(ext)) return 'text'
    return 'other'
  }

  async openFile(name) {
    const path = this.cwd + '\\' + name
    const type = this.typeOf(name)
    try {
      if (type === 'image') {
        const res = await window.eDEX.fsReadFile(path)
        const url = URL.createObjectURL(new Blob([res.data], { type: res.mime || 'image/*' }))
        new Modal({
          type: 'custom', title: name,
          html: `<img class="fsDisp_mediaDisp" src="${url}" ondragstart="return false;">`,
          onClose: () => setTimeout(() => URL.revokeObjectURL(url), 200)
        })
        return
      }
      if (type === 'audio' || type === 'video') { await openMedia({ name, path, type }); return }
      if (type === 'pdf') { await openDoc(path, name); return }
      if (type === 'text') {
        const res = await window.eDEX.fsReadFile(path)
        const text = new TextDecoder('utf-8').decode(new Uint8Array(res.data))
        new Modal({
          type: 'custom', title: name,
          html: `<textarea readonly rows="30" style="width:60vw;height:50vh;background:transparent;color:inherit;font-family:monospace;font-size:1.4vh;border:0.15vh solid rgb(var(--color_r),var(--color_g),var(--color_b));">${esc(text)}</textarea>`
        })
        return
      }
      new Modal({ type: 'info', title: 'Cannot preview', message: esc(name) + '\nThis file type cannot be previewed.' })
    } catch (e) {
      new Modal({ type: 'error', title: 'OPEN FAILED', message: (e && e.message) ? e.message : String(e) })
    }
  }
}
