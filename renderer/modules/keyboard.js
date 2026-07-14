// 屏幕键盘：移植自原版 keyboard.class.js，保持原版的 DOM 结构、修饰态、快捷键、
// 长按连发、Enter 两元素同步、物理键高亮与音效触发逻辑。
// 安全架构：无 node API；所有输入通过 inputFn 写入 pty，聚焦与音效通过注入的回调处理。
import { audiofx } from './audiofx.js'

const ICON_PATHS = {
  ARROW_UP: [
    'm12.00004 7.99999 4.99996 5h-2.99996v4.00001h-4v-4.00001h-3z',
    'm4 3h16c1.1046 0 1-0.10457 1 1v16c0 1.1046 0.1046 1-1 1h-16c-1.10457 0-1 0.1046-1-1v-16c0-1.10457-0.10457-1 1-1zm0 1v16h16v-16z'
  ],
  ARROW_LEFT: [
    'm7.500015 12.499975 5-4.99996v2.99996h4.00001v4h-4.00001v3z',
    'm4 3h16c1.1046 0 1-0.10457 1 1v16c0 1.1046 0.1046 1-1 1h-16c-1.10457 0-1 0.1046-1-1v-16c0-1.10457-0.10457-1 1-1zm0 1v16h16v-16z'
  ],
  ARROW_DOWN: [
    'm12 17-4.99996-5h2.99996v-4.00001h4v4.00001h3z',
    'm4 3h16c1.1046 0 1-0.10457 1 1v16c0 1.1046 0.1046 1-1 1h-16c-1.10457 0-1 0.1046-1-1v-16c0-1.10457-0.10457-1 1-1zm0 1v16h16v-16z'
  ],
  ARROW_RIGHT: [
    'm16.500025 12.500015-5 4.99996v-2.99996h-4.00001v-4h4.00001v-3z',
    'm4 3h16c1.1046 0 1-0.10457 1 1v16c0 1.1046 0.1046 1-1 1h-16c-1.10457 0-1 0.1046-1-1v-16c0-1.10457-0.10457-1 1-1zm0 1v16h16v-16z'
  ]
}

function iconSVG(name) {
  const paths = ICON_PATHS[name]
  if (!paths) return ''
  return `<svg viewBox="0 0 24.00 24.00"><path fill-opacity="1" d="${paths[0]}"/><path stroke-linejoin="round" fill-opacity="0.65" d="${paths[1]}"/></svg>`
}

export class Keyboard {
  // opts: { container: string, layout: object, input: (data:string)=>void, focus: ()=>void,
  //         shortcuts?: object[], onAppShortcut?: (action:string)=>void }
  constructor(opts) {
    if (!opts.layout || !opts.container) throw new Error('Missing options')

    const layout = opts.layout
    this.ctrlseq = ['', '\u001B', '\u001C', '\u001D', '\u001E', '\u001F', '\u0011', '\u0017', '\u0012', '\u0012', '\u0019', '\u0015', '\u0010', '\u0001', '\u0013', '\u0004', '\u0006', '\u001A', '\u0018', '\u0003', '\u0016', '\u0002']
    this.container = document.getElementById(opts.container)
    this.input = typeof opts.input === 'function' ? opts.input : () => {}
    this.focus = typeof opts.focus === 'function' ? opts.focus : () => {}
    this.onAppShortcut = typeof opts.onAppShortcut === 'function' ? opts.onAppShortcut : () => {}

    this.linkedToTerm = true
    this.detach = () => { this.linkedToTerm = false }
    this.attach = () => { this.linkedToTerm = true }

    this.container.dataset.isShiftOn = 'false'
    this.container.dataset.isCapsLckOn = 'false'
    this.container.dataset.isAltOn = 'false'
    this.container.dataset.isCtrlOn = 'false'
    this.container.dataset.isFnOn = 'false'
    this.container.dataset.passwordMode = 'false'

    this._shortcuts = {
      CtrlAltShift: [],
      CtrlAlt: [],
      CtrlShift: [],
      AltShift: [],
      Ctrl: [],
      Alt: [],
      Shift: []
    }
    const scuts = Array.isArray(opts.shortcuts) ? opts.shortcuts : []
    scuts.forEach((scut) => {
      const cut = Object.assign({}, scut)
      const mods = cut.trigger.split('+')
      cut.trigger = mods.pop()
      const order = ['Ctrl', 'Alt', 'Shift']
      mods.sort((a, b) => order.indexOf(a) - order.indexOf(b))
      const cat = mods.join('')
      if (cut.type === 'app' && cut.action === 'TAB_X' && cut.trigger === 'X') {
        for (let i = 1; i <= 5; i++) {
          const ncut = Object.assign({}, cut)
          ncut.trigger = `${i}`
          ncut.action = `TAB_${i}`
          this._shortcuts[cat].push(ncut)
        }
      } else {
        this._shortcuts[cat].push(cut)
      }
    })

    Object.keys(layout).forEach((row) => {
      this.container.innerHTML += `<div class="keyboard_row" id="${row}"></div>`
      layout[row].forEach((keyObj) => {
        const key = document.createElement('div')
        key.setAttribute('class', 'keyboard_key')

        if (keyObj.cmd === ' ') {
          key.setAttribute('id', 'keyboard_spacebar')
        } else if (keyObj.cmd === '\r') {
          key.setAttribute('class', 'keyboard_key keyboard_enter')
          key.innerHTML = `<h1>${this.sanitize(keyObj.name)}</h1>`
        } else {
          key.innerHTML = `
            <h5>${this.sanitize(keyObj.altshift_name || '')}</h5>
            <h4>${this.sanitize(keyObj.fn_name || '')}</h4>
            <h3>${this.sanitize(keyObj.alt_name || '')}</h3>
            <h2>${this.sanitize(keyObj.shift_name || '')}</h2>
            <h1>${this.sanitize(keyObj.name || '')}</h1>`
        }

        let icon = null
        if (String(keyObj.name || '').startsWith('ESCAPED|-- ICON: ')) {
          const iconName = String(keyObj.name).substr(17)
          switch (iconName) {
            case 'ARROW_UP': icon = iconSVG('ARROW_UP'); break
            case 'ARROW_LEFT': icon = iconSVG('ARROW_LEFT'); break
            case 'ARROW_DOWN': icon = iconSVG('ARROW_DOWN'); break
            case 'ARROW_RIGHT': icon = iconSVG('ARROW_RIGHT'); break
            default:
              icon = `<svg viewBox="0 0 24.00 24.00"><path fill="#ff0000" fill-opacity="1" d="M 8.27125,2.9978L 2.9975,8.27125L 2.9975,15.7275L 8.27125,21.0012L 15.7275,21.0012C 17.485,19.2437 21.0013,15.7275 21.0013,15.7275L 21.0013,8.27125L 15.7275,2.9978M 9.10125,5L 14.9025,5L 18.9988,9.10125L 18.9988,14.9025L 14.9025,18.9988L 9.10125,18.9988L 5,14.9025L 5,9.10125M 9.11625,7.705L 7.705,9.11625L 10.5912,12.0025L 7.705,14.8825L 9.11625,16.2937L 12.0025,13.4088L 14.8825,16.2937L 16.2938,14.8825L 13.4087,12.0025L 16.2938,9.11625L 14.8825,7.705L 12.0025,10.5913"/></svg>`
          }
          key.innerHTML = icon
        }

        Object.keys(keyObj).forEach((property) => {
          for (let i = 1; i < this.ctrlseq.length; i++) {
            keyObj[property] = String(keyObj[property] || '').replace(`~~~CTRLSEQ${i}~~~`, this.ctrlseq[i])
          }
          if (property.endsWith('cmd')) {
            key.dataset[property] = keyObj[property]
          }
        })

        document.getElementById(row).appendChild(key)
      })
    })

    this.container.childNodes.forEach((row) => {
      row.childNodes.forEach((key) => {
        const enterElements = document.querySelectorAll('.keyboard_enter')

        // 防御：容器内若有非按键元素（如面板标题），跳过，避免 key.attributes['class'] 为 null 报错
        if (!key || !key.attributes || !key.attributes.class) return

        if (key.attributes['class'].value.endsWith('keyboard_enter')) {
          key.onmousedown = (e) => {
            this.pressKey(key)
            key.holdTimeout = setTimeout(() => {
              key.holdInterval = setInterval(() => {
                this.pressKey(key)
              }, 70)
            }, 400)

            enterElements.forEach((k) => { k.setAttribute('class', 'keyboard_key active keyboard_enter') })

            if (this.linkedToTerm) this.focus()
            if (this.container.dataset.passwordMode === 'false') audiofx.play('granted')
            e.preventDefault()
          }
          key.onmouseup = () => {
            clearTimeout(key.holdTimeout)
            clearInterval(key.holdInterval)

            enterElements.forEach((k) => { k.setAttribute('class', 'keyboard_key blink keyboard_enter') })
            setTimeout(() => {
              enterElements.forEach((k) => { k.setAttribute('class', 'keyboard_key keyboard_enter') })
            }, 100)
          }
        } else {
          key.onmousedown = (e) => {
            if (/^ESCAPED\|-- (CTRL|SHIFT|ALT){1}.*/.test(key.dataset.cmd)) {
              const cmd = key.dataset.cmd.substr(11)
              if (cmd.startsWith('CTRL')) this.container.dataset.isCtrlOn = 'true'
              if (cmd.startsWith('SHIFT')) this.container.dataset.isShiftOn = 'true'
              if (cmd.startsWith('ALT')) this.container.dataset.isAltOn = 'true'
            } else {
              key.holdTimeout = setTimeout(() => {
                key.holdInterval = setInterval(() => { this.pressKey(key) }, 70)
              }, 400)
              this.pressKey(key)
            }

            if (this.linkedToTerm) this.focus()
            if (this.container.dataset.passwordMode === 'false') audiofx.play('stdin')
            e.preventDefault()
          }
          key.onmouseup = (e) => {
            if (/^ESCAPED\|-- (CTRL|SHIFT|ALT){1}.*/.test(key.dataset.cmd)) {
              const cmd = key.dataset.cmd.substr(11)
              if (cmd.startsWith('CTRL')) this.container.dataset.isCtrlOn = 'false'
              if (cmd.startsWith('SHIFT')) this.container.dataset.isShiftOn = 'false'
              if (cmd.startsWith('ALT')) this.container.dataset.isAltOn = 'false'
            } else {
              clearTimeout(key.holdTimeout)
              clearInterval(key.holdInterval)
            }

            key.setAttribute('class', 'keyboard_key blink')
            setTimeout(() => { key.setAttribute('class', 'keyboard_key') }, 100)
            e.preventDefault()
          }
        }

        key.onmouseleave = () => {
          clearTimeout(key.holdTimeout)
          clearInterval(key.holdInterval)
        }
      })
    })

    this.container.addEventListener('touchstart', (e) => {
      e.preventDefault()
      for (let i = 0; i < e.changedTouches.length; i++) {
        let key = e.changedTouches[i].target.parentElement
        if (key.tagName === 'svg') key = key.parentElement
        if (key.getAttribute('class').startsWith('keyboard_key')) {
          key.setAttribute('class', key.getAttribute('class') + ' active')
          key.onmousedown({ preventDefault: () => true })
        } else {
          key = e.changedTouches[i].target
          if (key.getAttribute('class').startsWith('keyboard_key')) {
            key.setAttribute('class', key.getAttribute('class') + ' active')
            key.onmousedown({ preventDefault: () => true })
          }
        }
      }
    }, { passive: false })

    const dropKeyTouchHandler = (e) => {
      e.preventDefault()
      for (let i = 0; i < e.changedTouches.length; i++) {
        let key = e.changedTouches[i].target.parentElement
        if (key.tagName === 'svg') key = key.parentElement
        if (key.getAttribute('class').startsWith('keyboard_key')) {
          key.setAttribute('class', key.getAttribute('class').replace('active', ''))
          key.onmouseup({ preventDefault: () => true })
        } else {
          key = e.changedTouches[i].target
          if (key.getAttribute('class').startsWith('keyboard_key')) {
            key.setAttribute('class', key.getAttribute('class').replace('active', ''))
            key.onmouseup({ preventDefault: () => true })
          }
        }
      }
    }
    this.container.addEventListener('touchend', dropKeyTouchHandler, { passive: false })
    this.container.addEventListener('touchcancel', dropKeyTouchHandler, { passive: false })

    const findKey = (e) => {
      let physkey
      (e.key === '"') ? physkey = '\\"' : physkey = e.key

      let key = document.querySelector(`div.keyboard_key[data-cmd="${this.cssEsc(physkey)}"]`)
      if (key === null) key = document.querySelector(`div.keyboard_key[data-shift_cmd="${this.cssEsc(physkey)}"]`)

      if (key === null && e.code === 'ShiftLeft') key = document.querySelector('div.keyboard_key[data-cmd="ESCAPED|-- SHIFT: LEFT"]')
      if (key === null && e.code === 'ShiftRight') key = document.querySelector('div.keyboard_key[data-cmd="ESCAPED|-- SHIFT: RIGHT"]')
      if (key === null && e.code === 'ControlLeft') key = document.querySelector('div.keyboard_key[data-cmd="ESCAPED|-- CTRL: LEFT"]')
      if (key === null && e.code === 'ControlRight') key = document.querySelector('div.keyboard_key[data-cmd="ESCAPED|-- CTRL: RIGHT"]')
      if (key === null && e.code === 'AltLeft') key = document.querySelector('div.keyboard_key[data-cmd="ESCAPED|-- FN: ON"]')
      if (key === null && e.code === 'AltRight') key = document.querySelector('div.keyboard_key[data-cmd="ESCAPED|-- ALT: RIGHT"]')
      if (key === null && e.code === 'CapsLock') key = document.querySelector('div.keyboard_key[data-cmd="ESCAPED|-- CAPSLCK: ON"]')
      if (key === null && e.code === 'Escape') key = document.querySelector(`div.keyboard_key[data-cmd="${this.cssEsc(this.ctrlseq[1])}"]`)
      if (key === null && e.code === 'Backspace') key = document.querySelector('div.keyboard_key[data-cmd="\b"]')
      if (key === null && e.code === 'ArrowUp') key = document.querySelector(`div.keyboard_key[data-cmd="${this.cssEsc(this.ctrlseq[1] + 'OA')}"]`)
      if (key === null && e.code === 'ArrowLeft') key = document.querySelector(`div.keyboard_key[data-cmd="${this.cssEsc(this.ctrlseq[1] + 'OD')}"]`)
      if (key === null && e.code === 'ArrowDown') key = document.querySelector(`div.keyboard_key[data-cmd="${this.cssEsc(this.ctrlseq[1] + 'OB')}"]`)
      if (key === null && e.code === 'ArrowRight') key = document.querySelector(`div.keyboard_key[data-cmd="${this.cssEsc(this.ctrlseq[1] + 'OC')}"]`)
      if (key === null && e.code === 'Enter') key = document.querySelectorAll('div.keyboard_key.keyboard_enter')

      if (key === null) key = document.querySelector(`div.keyboard_key[data-ctrl_cmd="${this.cssEsc(e.key)}"]`)
      if (key === null) key = document.querySelector(`div.keyboard_key[data-alt_cmd="${this.cssEsc(e.key)}"]`)

      return key
    }

    this.keydownHandler = (e) => {
      // 首次按键时恢复 AudioContext，确保当次就出声（不被浏览器自动播放策略静默）
      audiofx.unlock()
      // xterm 的 onKey 回调里 e 是 { key, domEvent }，domEvent 才是真 KeyboardEvent
      const ev = (e && e.domEvent) || e
      if (window.__dexKbdDebug) console.log('[keyboard] keydown', ev.key, ev.code)
      if (ev.getModifierState && ev.getModifierState('AltGraph') && ev.code === 'AltRight') {
        const el = document.querySelector('div.keyboard_key[data-cmd="ESCAPED|-- CTRL: LEFT"]')
        if (el) el.setAttribute('class', 'keyboard_key')
      }

      if (ev.code === 'ControlLeft' || ev.code === 'ControlRight') this.container.dataset.isCtrlOn = 'true'
      if (ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') this.container.dataset.isShiftOn = 'true'
      if (ev.code === 'AltLeft' || ev.code === 'AltRight') this.container.dataset.isAltOn = 'true'
      if (ev.code === 'CapsLock' && this.container.dataset.isCapsLckOn !== 'true') this.container.dataset.isCapsLckOn = 'true'
      if (ev.code === 'CapsLock' && this.container.dataset.isCapsLckOn === 'true') this.container.dataset.isCapsLckOn = 'false'

      const key = findKey(ev)
      if (key === null) return
      if (key.length) {
        key.forEach((enterElement) => { enterElement.setAttribute('class', 'keyboard_key active keyboard_enter') })
      } else {
        key.setAttribute('class', 'keyboard_key active')
      }

      if (ev.repeat === false || (ev.repeat === true && !ev.code.startsWith('Shift') && !ev.code.startsWith('Alt') && !ev.code.startsWith('Control') && !ev.code.startsWith('Caps'))) {
        if (this.container.dataset.passwordMode === 'false') audiofx.play('stdin')
      }
    }

    this.keyupHandler = (e) => {
      const ev = (e && e.domEvent) || e
      if (ev.key === 'Control' && ev.getModifierState && ev.getModifierState('AltGraph')) return

      if (ev.code === 'ControlLeft' || ev.code === 'ControlRight') this.container.dataset.isCtrlOn = 'false'
      if (ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') this.container.dataset.isShiftOn = 'false'
      if (ev.code === 'AltLeft' || ev.code === 'AltRight') this.container.dataset.isAltOn = 'false'

      const key = findKey(ev)
      if (key === null) return
      if (key.length) {
        key.forEach((enterElement) => { enterElement.setAttribute('class', 'keyboard_key blink keyboard_enter') })
        setTimeout(() => {
          key.forEach((enterElement) => { enterElement.setAttribute('class', 'keyboard_key keyboard_enter') })
        }, 100)
      } else {
        key.setAttribute('class', 'keyboard_key blink')
        setTimeout(() => { key.setAttribute('class', 'keyboard_key') }, 100)
      }

      if (this.container.dataset.passwordMode === 'false' && ev.key === 'Enter') audiofx.play('granted')
    }

    // 关键修复：xterm 在 textarea 的 keydown 处理里调用 ev.stopPropagation()，
    // 冒泡阶段的 document.onkeydown 永远收不到事件 → 物理键高亮/音效失效。
    // 改用 window 捕获阶段监听（先于 xterm 的 textarea 目标阶段触发），绕过 stopPropagation。
    window.addEventListener('keydown', this.keydownHandler, true)
    window.addEventListener('keyup', this.keyupHandler, true)

    window.addEventListener('blur', () => {
      document.querySelectorAll('div.keyboard_key.active').forEach((key) => {
        key.setAttribute('class', key.getAttribute('class').replace('active', ''))
        key.onmouseup({ preventDefault: () => true })
      })
    })
  }

  cssEsc(s) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s)
    return String(s).replace(/([\\"'])/g, '\\$1')
  }

  sanitize(s) {
    return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  pressKey(key) {
    let cmd = key.dataset.cmd || ''

    let shortcutsCat = ''
    if (this.container.dataset.isCtrlOn === 'true') shortcutsCat += 'Ctrl'
    if (this.container.dataset.isAltOn === 'true') shortcutsCat += 'Alt'
    if (this.container.dataset.isShiftOn === 'true') shortcutsCat += 'Shift'

    let shortcutsTriggered = false

    if (shortcutsCat.length > 1) {
      this._shortcuts[shortcutsCat].forEach((cut) => {
        if (!cut.enabled) return

        let trig = cut.trigger.toLowerCase()
          .replace('plus', '+')
          .replace('space', ' ')
          .replace('tab', '\t')
          .replace(/backspace|delete/, '\b')
          .replace(/esc|escape/, this.ctrlseq[1])
          .replace(/return|enter/, '\r')

        if (cmd !== trig) return

        if (cut.type === 'app') {
          this.onAppShortcut(cut.action)
          shortcutsTriggered = true
        } else if (cut.type === 'shell') {
          this.input(cut.action + (cut.linebreak ? '\r\n' : ''))
        } else {
          console.warn(`${cut.trigger} has unknown type`)
        }
      })
    }

    if (shortcutsTriggered) return

    if (this.container.dataset.isShiftOn === 'true' && key.dataset.shift_cmd) cmd = key.dataset.shift_cmd
    if (this.container.dataset.isCapsLckOn === 'true' && key.dataset.capslck_cmd) cmd = key.dataset.capslck_cmd
    if (this.container.dataset.isCtrlOn === 'true' && key.dataset.ctrl_cmd) cmd = key.dataset.ctrl_cmd
    if (this.container.dataset.isAltOn === 'true' && key.dataset.alt_cmd) cmd = key.dataset.alt_cmd
    if (this.container.dataset.isAltOn === 'true' && this.container.dataset.isShiftOn === 'true' && key.dataset.altshift_cmd) cmd = key.dataset.altshift_cmd
    if (this.container.dataset.isFnOn === 'true' && key.dataset.fn_cmd) cmd = key.dataset.fn_cmd
    if (this.container.dataset.isNextCircum === 'true') { cmd = this.addCircum(cmd); this.container.dataset.isNextCircum = 'false' }
    if (this.container.dataset.isNextTrema === 'true') { cmd = this.addTrema(cmd); this.container.dataset.isNextTrema = 'false' }
    if (this.container.dataset.isNextAcute === 'true') { cmd = this.addAcute(cmd); this.container.dataset.isNextAcute = 'false' }
    if (this.container.dataset.isNextGrave === 'true') { cmd = this.addGrave(cmd); this.container.dataset.isNextGrave = 'false' }
    if (this.container.dataset.isNextCaron === 'true') { cmd = this.addCaron(cmd); this.container.dataset.isNextCaron = 'false' }
    if (this.container.dataset.isNextBar === 'true') { cmd = this.addBar(cmd); this.container.dataset.isNextBar = 'false' }
    if (this.container.dataset.isNextBreve === 'true') { cmd = this.addBreve(cmd); this.container.dataset.isNextBreve = 'false' }
    if (this.container.dataset.isNextTilde === 'true') { cmd = this.addTilde(cmd); this.container.dataset.isNextTilde = 'false' }
    if (this.container.dataset.isNextMacron === 'true') { cmd = this.addMacron(cmd); this.container.dataset.isNextMacron = 'false' }
    if (this.container.dataset.isNextCedilla === 'true') { cmd = this.addCedilla(cmd); this.container.dataset.isNextCedilla = 'true' }
    if (this.container.dataset.isNextOverring === 'true') { cmd = this.addOverring(cmd); this.container.dataset.isNextOverring = 'false' }
    if (this.container.dataset.isNextGreek === 'true') { cmd = this.toGreek(cmd); this.container.dataset.isNextGreek = 'false' }
    if (this.container.dataset.isNextIotasub === 'true') { cmd = this.addIotasub(cmd); this.container.dataset.isNextIotasub = 'false' }

    if (cmd.startsWith('ESCAPED|-- ')) {
      cmd = cmd.substr(11)
      switch (cmd) {
        case 'CAPSLCK: ON': this.container.dataset.isCapsLckOn = 'true'; return true
        case 'CAPSLCK: OFF': this.container.dataset.isCapsLckOn = 'false'; return true
        case 'FN: ON': this.container.dataset.isFnOn = 'true'; return true
        case 'FN: OFF': this.container.dataset.isFnOn = 'false'; return true
        case 'CIRCUM': this.container.dataset.isNextCircum = 'true'; return true
        case 'TREMA': this.container.dataset.isNextTrema = 'true'; return true
        case 'ACUTE': this.container.dataset.isNextAcute = 'true'; return true
        case 'GRAVE': this.container.dataset.isNextGrave = 'true'; return true
        case 'CARON': this.container.dataset.isNextCaron = 'true'; return true
        case 'BAR': this.container.dataset.isNextBar = 'true'; return true
        case 'BREVE': this.container.dataset.isNextBreve = 'true'; return true
        case 'TILDE': this.container.dataset.isNextTilde = 'true'; return true
        case 'MACRON': this.container.dataset.isNextMacron = 'true'; return true
        case 'CEDILLA': this.container.dataset.isNextCedilla = 'true'; return true
        case 'OVERRING': this.container.dataset.isNextOverring = 'true'; return true
        case 'GREEK': this.container.dataset.isNextGreek = 'true'; return true
        case 'IOTASUB': this.container.dataset.isNextIotasub = 'true'; return true
      }
    }

    if (cmd === '\n') {
      if (this.linkedToTerm) {
        this.input('\r\n')
      } else {
        document.activeElement.dispatchEvent(new CustomEvent('change', { detail: 'enter' }))
      }
      return true
    }

    if (this.linkedToTerm) {
      this.input(cmd)
    } else {
      let isDelete = false
      if (typeof document.activeElement.value !== 'undefined') {
        switch (cmd) {
          case '\b':
            document.activeElement.value = document.activeElement.value.slice(0, -1)
            isDelete = true
            break
          case this.ctrlseq[1] + 'OD':
            document.activeElement.selectionStart--
            document.activeElement.selectionEnd = document.activeElement.selectionStart
            break
          case this.ctrlseq[1] + 'OC':
            document.activeElement.selectionEnd++
            document.activeElement.selectionStart = document.activeElement.selectionEnd
            break
          default:
            if (this.ctrlseq.indexOf(cmd.slice(0, 1)) !== -1) {
              // 防止写入其他控制序列
            } else {
              document.activeElement.value = document.activeElement.value + cmd
            }
        }
      }
      document.activeElement.dispatchEvent(new CustomEvent('input', { detail: (isDelete ? 'delete' : 'insert') }))
      document.activeElement.focus()
    }
  }

  togglePasswordMode() {
    let d = this.container.dataset.passwordMode
    d = (d === 'true') ? 'false' : 'true'
    this.container.dataset.passwordMode = d
    return d
  }

  addCircum(char) {
    switch (char) {
      case 'a': return 'â'; case 'A': return 'Â'; case 'z': return 'ẑ'; case 'Z': return 'Ẑ'
      case 'e': return 'ê'; case 'E': return 'Ê'; case 'y': return 'ŷ'; case 'Y': return 'Ŷ'
      case 'u': return 'û'; case 'U': return 'Û'; case 'i': return 'î'; case 'I': return 'Î'
      case 'o': return 'ô'; case 'O': return 'Ô'; case 's': return 'ŝ'; case 'S': return 'Ŝ'
      case 'g': return 'ĝ'; case 'G': return 'Ĝ'; case 'h': return 'ĥ'; case 'H': return 'Ĥ'
      case 'j': return 'ĵ'; case 'J': return 'Ĵ'; case 'w': return 'ŵ'; case 'W': return 'Ŵ'
      case 'c': return 'ĉ'; case 'C': return 'Ĉ'
      case '1': return '¹'; case '2': return '²'; case '3': return '³'; case '4': return '⁴'
      case '5': return '⁵'; case '6': return '⁶'; case '7': return '⁷'; case '8': return '⁸'
      case '9': return '⁹'; case '0': return '⁰'
      default: return char
    }
  }
  addTrema(char) {
    switch (char) {
      case 'a': return 'ä'; case 'A': return 'Ä'; case 'e': return 'ë'; case 'E': return 'Ë'
      case 't': return 'ẗ'; case 'y': return 'ÿ'; case 'Y': return 'Ÿ'; case 'u': return 'ü'
      case 'U': return 'Ü'; case 'i': return 'ï'; case 'I': return 'Ï'; case 'o': return 'ö'
      case 'O': return 'Ö'; case 'h': return 'ḧ'; case 'H': return 'Ḧ'; case 'w': return 'ẅ'
      case 'W': return 'Ẅ'; case 'x': return 'ẍ'; case 'X': return 'Ẍ'
      default: return char
    }
  }
  addAcute(char) {
    switch (char) {
      case 'a': return 'á'; case 'A': return 'Á'; case 'c': return 'ć'; case 'C': return 'Ć'
      case 'e': return 'é'; case 'E': return 'É'; case 'g': return 'ǵ'; case 'G': return 'Ǵ'
      case 'i': return 'í'; case 'I': return 'Í'; case 'j': return 'ȷ́'; case 'J': return 'J́'
      case 'k': return 'ḱ'; case 'K': return 'Ḱ'; case 'l': return 'ĺ'; case 'L': return 'Ĺ'
      case 'm': return 'ḿ'; case 'M': return 'Ḿ'; case 'n': return 'ń'; case 'N': return 'Ń'
      case 'o': return 'ó'; case 'O': return 'Ó'; case 'p': return 'ṕ'; case 'P': return 'Ṕ'
      case 'r': return 'ŕ'; case 'R': return 'Ŕ'; case 's': return 'ś'; case 'S': return 'Ś'
      case 'u': return 'ú'; case 'U': return 'Ú'; case 'v': return 'v́'; case 'V': return 'V́'
      case 'w': return 'ẃ'; case 'W': return 'Ẃ'; case 'y': return 'ý'; case 'Y': return 'Ý'
      case 'z': return 'ź'; case 'Z': return 'Ź'; case 'ê': return 'ế'; case 'Ê': return 'Ế'
      case 'ç': return 'ḉ'; case 'Ç': return 'Ḉ'
      default: return char
    }
  }
  addGrave(char) {
    switch (char) {
      case 'a': return 'à'; case 'A': return 'À'; case 'e': return 'è'; case 'E': return 'È'
      case 'i': return 'ì'; case 'I': return 'Ì'; case 'm': return 'm̀'; case 'M': return 'M̀'
      case 'n': return 'ǹ'; case 'N': return 'Ǹ'; case 'o': return 'ò'; case 'O': return 'Ò'
      case 'u': return 'ù'; case 'U': return 'Ù'; case 'v': return 'v̀'; case 'V': return 'V̀'
      case 'w': return 'ẁ'; case 'W': return 'Ẁ'; case 'y': return 'ỳ'; case 'Y': return 'Ỳ'
      case 'ê': return 'ề'; case 'Ê': return 'Ề'
      default: return char
    }
  }
  addCaron(char) {
    switch (char) {
      case 'a': return 'ǎ'; case 'A': return 'Ǎ'; case 'c': return 'č'; case 'C': return 'Č'
      case 'd': return 'ď'; case 'D': return 'Ď'; case 'e': return 'ě'; case 'E': return 'Ě'
      case 'g': return 'ǧ'; case 'G': return 'Ǧ'; case 'h': return 'ȟ'; case 'H': return 'Ȟ'
      case 'i': return 'ǐ'; case 'I': return 'Ǐ'; case 'j': return 'ǰ'; case 'k': return 'ǩ'
      case 'K': return 'Ǩ'; case 'l': return 'ľ'; case 'L': return 'Ľ'; case 'n': return 'ň'
      case 'N': return 'Ň'; case 'o': return 'ǒ'; case 'O': return 'Ǒ'; case 'r': return 'ř'
      case 'R': return 'Ř'; case 's': return 'š'; case 'S': return 'Š'; case 't': return 'ť'
      case 'T': return 'Ť'; case 'u': return 'ǔ'; case 'U': return 'Ǔ'; case 'z': return 'ž'
      case 'Z': return 'Ž'
      case '1': return '₁'; case '2': return '₂'; case '3': return '₃'; case '4': return '₄'
      case '5': return '₅'; case '6': return '₆'; case '7': return '₇'; case '8': return '₈'
      case '9': return '₉'; case '0': return '₀'
      default: return char
    }
  }
  addBar(char) {
    switch (char) {
      case 'a': return 'ⱥ'; case 'A': return 'Ⱥ'; case 'b': return 'ƀ'; case 'B': return 'Ƀ'
      case 'c': return 'ȼ'; case 'C': return 'Ȼ'; case 'd': return 'đ'; case 'D': return 'Đ'
      case 'e': return 'ɇ'; case 'E': return 'Ɇ'; case 'g': return 'ǥ'; case 'G': return 'Ǥ'
      case 'h': return 'ħ'; case 'H': return 'Ħ'; case 'i': return 'ɨ'; case 'I': return 'Ɨ'
      case 'j': return 'ɉ'; case 'J': return 'Ɉ'; case 'l': return 'ł'; case 'L': return 'Ł'
      case 'o': return 'ø'; case 'O': return 'Ø'; case 'p': return 'ᵽ'; case 'P': return 'Ᵽ'
      case 'r': return 'ɍ'; case 'R': return 'Ɍ'; case 't': return 'ŧ'; case 'T': return 'Ŧ'
      case 'u': return 'ʉ'; case 'U': return 'Ʉ'; case 'y': return 'ɏ'; case 'Y': return 'Ɏ'
      case 'z': return 'ƶ'; case 'Z': return 'Ƶ'
      default: return char
    }
  }
  addBreve(char) {
    switch (char) {
      case 'a': return 'ă'; case 'A': return 'Ă'; case 'e': return 'ĕ'; case 'E': return 'Ĕ'
      case 'g': return 'ğ'; case 'G': return 'Ğ'; case 'i': return 'ĭ'; case 'I': return 'Ĭ'
      case 'o': return 'ŏ'; case 'O': return 'Ŏ'; case 'u': return 'ŭ'; case 'U': return 'Ŭ'
      case 'à': return 'ằ'; case 'À': return 'Ằ'
      default: return char
    }
  }
  addTilde(char) {
    switch (char) {
      case 'a': return 'ã'; case 'A': return 'Ã'; case 'e': return 'ẽ'; case 'E': return 'Ẽ'
      case 'i': return 'ĩ'; case 'I': return 'Ĩ'; case 'n': return 'ñ'; case 'N': return 'Ñ'
      case 'o': return 'õ'; case 'O': return 'Õ'; case 'u': return 'ũ'; case 'U': return 'Ũ'
      case 'v': return 'ṽ'; case 'V': return 'Ṽ'; case 'y': return 'ỹ'; case 'Y': return 'Ỹ'
      case 'ê': return 'ễ'; case 'Ê': return 'Ễ'
      default: return char
    }
  }
  addMacron(char) {
    switch (char) {
      case 'a': return 'ā'; case 'A': return 'Ā'; case 'e': return 'ē'; case 'E': return 'Ē'
      case 'g': return 'ḡ'; case 'G': return 'Ḡ'; case 'i': return 'ī'; case 'I': return 'Ī'
      case 'o': return 'ō'; case 'O': return 'Ō'; case 'u': return 'ū'; case 'U': return 'Ū'
      case 'y': return 'ȳ'; case 'Y': return 'Ȳ'; case 'é': return 'ḗ'; case 'É': return 'Ḗ'
      case 'è': return 'ḕ'; case 'È': return 'Ḕ'
      default: return char
    }
  }
  addCedilla(char) {
    switch (char) {
      case 'c': return 'ç'; case 'C': return 'Ç'; case 'd': return 'ḑ'; case 'D': return 'Ḑ'
      case 'e': return 'ȩ'; case 'E': return 'Ȩ'; case 'g': return 'ģ'; case 'G': return 'Ģ'
      case 'h': return 'ḩ'; case 'H': return 'Ḩ'; case 'k': return 'ķ'; case 'K': return 'Ķ'
      case 'l': return 'ļ'; case 'L': return 'Ļ'; case 'n': return 'ņ'; case 'N': return 'Ņ'
      case 'r': return 'ŗ'; case 'R': return 'Ŗ'; case 's': return 'ş'; case 'S': return 'Ş'
      case 't': return 'ţ'; case 'T': return 'Ţ'
      default: return char
    }
  }
  addOverring(char) {
    switch (char) {
      case 'a': return 'å'; case 'A': return 'Å'; case 'u': return 'ů'; case 'U': return 'Ů'
      case 'w': return 'ẘ'; case 'y': return 'ẙ'
      default: return char
    }
  }
  toGreek(char) {
    switch (char) {
      case 'b': return 'β'; case 'p': return 'π'; case 'P': return 'Π'; case 'd': return 'δ'
      case 'D': return 'Δ'; case 'l': return 'λ'; case 'L': return 'Λ'; case 'j': return 'θ'
      case 'J': return 'Θ'; case 'z': return 'ζ'; case 'w': return 'ω'; case 'W': return 'Ω'
      case 'A': return 'α'; case 'u': return 'υ'; case 'U': return 'Υ'; case 'i': return 'ι'
      case 'e': return 'ε'; case 't': return 'τ'; case 's': return 'σ'; case 'S': return 'Σ'
      case 'r': return 'ρ'; case 'R': return 'Ρ'; case 'n': return 'ν'; case 'm': return 'μ'
      case 'y': return 'ψ'; case 'Y': return 'Ψ'; case 'x': return 'ξ'; case 'X': return 'Ξ'
      case 'k': return 'κ'; case 'q': return 'χ'; case 'Q': return 'Χ'; case 'g': return 'γ'
      case 'G': return 'Γ'; case 'h': return 'η'; case 'f': return 'φ'; case 'F': return 'Φ'
      default: return char
    }
  }
  addIotasub(char) {
    switch (char) {
      case 'o': return 'ǫ'; case 'O': return 'Ǫ'; case 'a': return 'ą'; case 'A': return 'Ą'
      case 'u': return 'ų'; case 'U': return 'Ų'; case 'i': return 'į'; case 'I': return 'Į'
      case 'e': return 'ę'; case 'E': return 'Ę'
      default: return char
    }
  }
}
