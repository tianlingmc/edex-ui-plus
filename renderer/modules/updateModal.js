// 统一更新弹窗控制器（单例）
// 极简版：仅「检测 + 跳转发布页」，无下载 / 安装 / 进度条 / 不可关闭态。
// 独立于设置页，挂载到 document.body；启动静默检测与手动检查共用同一组件，弹窗均可正常关闭。

import { t } from '../locale.js'
import { esc } from '../ui.js'

// 模块级内联样式（仅注入一次）
const MODAL_CSS = `
#edex-update-modal {
  position: fixed; inset: 0; z-index: 100000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.55);
  animation: edex_um_fadeIn .15s ease;
}
@keyframes edex_um_fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
#edex-update-modal .um_card {
  width: 26vw; min-width: 280px;
  background: var(--color_light_black, #0b0e14);
  color: rgb(var(--color_r), var(--color_g), var(--color_b));
  font-family: var(--font_main, 'Fira Mono');
  --aug-border: 0.18vh;
  --aug-border-bg: rgb(var(--color_r), var(--color_g), var(--color_b));
  --aug-border-opacity: 0.5;
  border: 0.12vh solid rgb(var(--color_r), var(--color_g), var(--color_b));
  clip-path: polygon(0.8vh 0, 100% 0, 100% 100%, 0 100%, 0 0.8vh);
}
#edex-update-modal .um_title {
  margin: 0; padding: 0.6vh 0.9vw; font-size: 1.3vh; letter-spacing: 0.08vw;
  border-bottom: 0.1vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.3);
  display: flex; justify-content: space-between; align-items: center; opacity: 0.9;
}
#edex-update-modal .um_title p { margin: 0; }
#edex-update-modal .um_close { margin: 0; opacity: 0.55; font-size: 1.4vh; line-height: 1; padding: 0 0.2vw; cursor: pointer; }
#edex-update-modal .um_close:hover { opacity: 1; }
#edex-update-modal .um_body { padding: 1vh 0.9vw; }
#edex-update-modal .um_hint { font-size: 1.2vh; opacity: 0.85; margin: 0.5vh 0; }
#edex-update-modal .um_actions { display: flex; gap: 0.8vw; margin-top: 1vh; }
#edex-update-modal .um_btn {
  flex: 1; padding: 0.7vh 0; border: none; cursor: pointer;
  font-size: 1.3vh; font-family: var(--font_main); font-weight: bold;
  letter-spacing: 0.1vw; transition: opacity .12s ease;
  clip-path: polygon(0.4vh 0, 100% 0, 100% 100%, 0 100%, 0 0.4vh);
}
#edex-update-modal .um_btn_primary { background: rgb(var(--color_r), var(--color_g), var(--color_b)); color: var(--color_light_black); }
#edex-update-modal .um_btn:hover { opacity: 0.85; }
#edex-update-modal .um_btn:active { opacity: 0.6; }
`

// 多语言模板占位符替换（t() 本身不支持插值）：{latest} / {current}
function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : '{' + k + '}'))
}

class UpdateController {
  constructor() {
    /** @type {string} 'idle' | 'checking' | 'available' | 'none' | 'error' */
    this.state = 'idle'
    this.data = { current: '', latest: '', url: '' }
    this._escAttached = false
    this._onEsc = this._onEsc.bind(this)
  }

  /**
   * 幂等合并 data、设置 state 并重新渲染。
   * @param {object} partial { status, current, latest, url }
   */
  openUpdateModal(partial) {
    const p = partial || {}
    if (p.current !== undefined) this.data.current = p.current
    if (p.latest !== undefined) this.data.latest = p.latest
    if (p.url !== undefined) this.data.url = p.url
    if (p.status) this.state = p.status
    this._render()
  }

  closeUpdateModal() {
    this.state = 'idle'
    this._render()
  }

  _render() {
    if (!document.getElementById('edex-update-modal-style')) {
      const style = document.createElement('style')
      style.id = 'edex-update-modal-style'
      style.textContent = MODAL_CSS
      document.head.appendChild(style)
    }

    if (this.state === 'idle') {
      const old = document.getElementById('edex-update-modal')
      if (old) old.remove()
      if (this._escAttached) {
        window.removeEventListener('keydown', this._onEsc, true)
        this._escAttached = false
      }
      return
    }

    // 弹窗存在期间挂载捕获阶段 ESC 监听：拦截并优先关闭本弹窗（极简版所有状态均可关闭）
    if (!this._escAttached) {
      window.addEventListener('keydown', this._onEsc, true)
      this._escAttached = true
    }

    const s = this.state
    const d = this.data

    let bodyHtml = ''
    if (s === 'checking') {
      bodyHtml = `<p class="um_hint">${esc(t('update_checking'))}</p>`
    } else if (s === 'available') {
      bodyHtml = `
        <p class="um_hint">${esc(fill(t('update_available'), { latest: d.latest, current: d.current }))}</p>
        <div class="um_actions">
          <button class="um_btn um_btn_primary" id="um-open">${esc(t('update_open_release'))}</button>
        </div>`
    } else if (s === 'none') {
      bodyHtml = `<p class="um_hint">${esc(t('update_none'))}</p>`
    } else if (s === 'error') {
      bodyHtml = `<p class="um_hint">${esc(t('update_error'))}</p>`
    }

    const html = `
      <div id="edex-update-modal" class="um_overlay">
        <div class="um_card augmented" augmented-ui="bl-clip tr-clip exe">
          <h3 class="um_title"><p>${esc(t('update_title'))}</p><p id="um-close" class="um_close" title="${esc(t('update_close'))}">✕</p></h3>
          <div class="um_body">${bodyHtml}</div>
        </div>
      </div>`

    const existing = document.getElementById('edex-update-modal')
    if (existing) existing.remove()
    document.body.insertAdjacentHTML('beforeend', html)

    const closeEl = document.getElementById('um-close')
    if (closeEl) closeEl.addEventListener('click', () => this.closeUpdateModal())
    const openEl = document.getElementById('um-open')
    if (openEl) openEl.addEventListener('click', () => {
      if (d.url && window.eDEX && typeof window.eDEX.openExternal === 'function') {
        try { window.eDEX.openExternal(d.url) } catch (_) {}
      }
    })
  }

  // 捕获阶段 ESC 监听：弹窗存在时拦截并关闭（极简版所有状态均可关闭）
  _onEsc(e) {
    if (e.key !== 'Escape') return
    const overlay = document.getElementById('edex-update-modal')
    if (!overlay) return
    e.preventDefault()
    e.stopImmediatePropagation()
    this.closeUpdateModal()
  }
}

// 模块级单例（整个应用共享同一状态机）
const controller = new UpdateController()

export function openUpdateModal(partial) {
  return controller.openUpdateModal(partial)
}

export function closeUpdateModal() {
  return controller.closeUpdateModal()
}
