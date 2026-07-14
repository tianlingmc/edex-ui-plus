// 通用模态框（复用原版 eDEX-UI modal.css 的样式与 DOM 结构，安全架构下不再依赖 nodeIntegration）
// 原版类名：.modal_popup.<type>[augmented-ui]，结构为 <h1>标题</h1> + 内容 + <div>按钮</div>，
// 直接挂到 body（position:absolute，由 modal.css 控制），可拖拽，关闭时闪一下再移除。
// 按钮使用 onClick 回调（不再用内联 action 字符串，避免注入风险）。

import { t } from '../locale.js'

let zCounter = 1500
const _openModals = [] // 全局 Modal 栈，供 ESC 关闭使用

// 原版各类型对应的 augmented-ui 切角组合
const AUGS = {
  info: 'tr-clip bl-clip exe',
  custom: 'tr-clip bl-clip exe',
  warning: 'bl-clip tr-clip r-rect b-rect exe',
  error: 'tr-clip bl-rect r-clip exe'
}

export class Modal {
  constructor({ title = 'Modal', type = 'info', message = '', html = '', buttons = [], onClose }) {
    this.type = type
    this.closed = false
    this.onClose = onClose

    const box = document.createElement('div')
    box.className = `modal_popup ${type}`
    box.setAttribute('augmented-ui', AUGS[type] || AUGS.info)
    box.style.zIndex = String(zCounter++)

    const titleBar = document.createElement('h1')
    titleBar.textContent = title

    const bodyEl = document.createElement('div')
    bodyEl.innerHTML = type === 'custom' ? html : `<h5>${String(message).replace(/</g, '&lt;')}</h5>`

    const btnRow = document.createElement('div')
    const defaultButtons = (type === 'error')
      ? [{ label: t('btn_panic'), onClick: () => this.close() }, { label: t('btn_reload'), onClick: () => location.reload() }]
      : [{ label: t('btn_ok'), onClick: () => this.close() }]
    const allButtons = (type === 'custom' ? buttons.concat([{ label: t('btn_close'), onClick: () => this.close() }]) : defaultButtons)
    allButtons.forEach((b) => {
      const btn = document.createElement('button')
      btn.textContent = b.label
      btn.addEventListener('click', () => {
        try { if (b.onClick) b.onClick() } catch (e) { console.error('[modal] button error', e) }
        if (!b.keepOpen) this.close()
      })
      btnRow.appendChild(btn)
    })

    box.appendChild(titleBar)
    box.appendChild(bodyEl)
    box.appendChild(btnRow)
    document.body.appendChild(box)

    this.box = box
    this.bodyEl = bodyEl

    // 居中（modal.css 里 position:absolute，需给定 left/top）
    requestAnimationFrame(() => {
      const w = box.offsetWidth
      const h = box.offsetHeight
      box.style.left = Math.max(8, (window.innerWidth - w) / 2) + 'px'
      box.style.top = Math.max(8, (window.innerHeight - h) / 2) + 'px'
    })

    this._enableDrag(titleBar, box)
    // 注册到全局 Modal 栈，ESC 可关闭
    _openModals.push(this)
  }

  // 内容变化后重新居中（进程列表等动态内容加载完调用）
  recenter() {
    requestAnimationFrame(() => {
      const w = this.box.offsetWidth
      const h = this.box.offsetHeight
      this.box.style.left = Math.max(8, (window.innerWidth - w) / 2) + 'px'
      this.box.style.top = Math.max(8, (window.innerHeight - h) / 2) + 'px'
    })
  }

  _enableDrag(handle, box) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false
    const down = (e) => {
      dragging = true
      sx = e.clientX; sy = e.clientY
      ox = box.offsetLeft; oy = box.offsetTop
      e.preventDefault()
    }
    const move = (e) => {
      if (!dragging) return
      box.style.left = (ox + e.clientX - sx) + 'px'
      box.style.top = (oy + e.clientY - sy) + 'px'
    }
    const up = () => { dragging = false }
    handle.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    // 关闭时移除全局监听，避免累积
    this._cleanupDrag = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }

  close() {
    if (this.closed) return
    this.closed = true
    // 从全局栈移除
    const idx = _openModals.indexOf(this)
    if (idx !== -1) _openModals.splice(idx, 1)
    try { if (this.onClose) this.onClose() } catch (e) { console.error('[modal] onClose error', e) }
    try { if (this._cleanupDrag) this._cleanupDrag() } catch (_) {}
    this.box.classList.add('blink')
    setTimeout(() => { this.box.remove() }, 120)
  }
}

// 便捷封装：信息 / 警告 / 错误弹窗
export function alertModal(title, message, type = 'info') {
  return new Modal({ title, message, type })
}

// 关闭顶层 Modal（供 ESC 全局快捷键调用）
export function closeTopModal() {
  while (_openModals.length > 0) {
    const m = _openModals[_openModals.length - 1]
    m.close()
  }
}
