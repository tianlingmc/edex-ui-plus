import '@xterm/xterm/css/xterm.css'
import 'augmented-ui/augmented-ui.css'

// 原版 eDEX-UI 样式（同一套 --color_r/g/b + --aug-* 主题变量 + augmented-ui），直接复用以还原视觉。
// 顺序：先导入已对齐 DOM 的原版 css（body/列/终端面板/启动/模态/命令面板/比例修正），
// 各监控模块的 mod_*.css 在其 DOM 移植完成后再逐个加入（避免未移植模块被原版 opacity:0 等规则误伤）。
// 本工程补充/覆盖样式必须最后导入，确保覆盖生效。
import './assets/css-origin/css/main.css'
import './assets/css-origin/css/modal.css'
import './assets/css-origin/css/boot_screen.css'
import './assets/css-origin/css/main_shell.css'
import './assets/css-origin/css/mod_column.css'
import './assets/css-origin/css/mod_fuzzyFinder.css'
import './assets/css-origin/css/extra_ratios.css'

// 各监控模块的原版样式（DOM 已移植为原版结构，顺序随意，但必须在本工程覆盖样式之前）
import './assets/css-origin/css/mod_clock.css'
import './assets/css-origin/css/mod_sysinfo.css'
import './assets/css-origin/css/mod_cpuinfo.css'
import './assets/css-origin/css/mod_ramwatcher.css'
import './assets/css-origin/css/mod_netstat.css'
import './assets/css-origin/css/mod_conninfo.css'
import './assets/css-origin/css/mod_hardwareInspector.css'
import './assets/css-origin/css/mod_toplist.css'
import './assets/css-origin/css/mod_globe.css'
import './assets/css-origin/css/filesystem.css'
import './assets/css-origin/css/keyboard.css'
import './assets/css-origin/css/media_player.css'

// 本工程补充/覆盖样式（必须最后导入）
import './css/main.css'

import { applyTheme, DEFAULT_THEME, setTheme, nextTheme, getCurrentTheme, setOnThemeChange } from './theme.js'
import { initTelemetry } from './telemetry.js'
import { runBootSequence } from './boot.js'
import { Clock } from './modules/clock.js'
import { Sysinfo } from './modules/sysinfo.js'
import { Cpuinfo } from './modules/cpuinfo.js'
import { RAMwatcher } from './modules/ramwatcher.js'
import { Netstat } from './modules/netstat.js'
import { Conninfo } from './modules/conninfo.js'
import { LocationGlobe } from './modules/locationGlobe.js'
import { Filesystem } from './modules/filesystem.js'
import { Keyboard } from './modules/keyboard.js'
import { Toplist } from './modules/toplist.js'
import { HardwareInspector } from './modules/hardwareInspector.js'
import { TerminalManager } from './modules/terminalManager.js'
import { checkForUpdates } from './modules/updateChecker.js'
import { FuzzyFinder } from './modules/fuzzyFinder.js'
import { openSettings, closeSettings } from './modules/settingsEditor.js'
import { t } from './locale.js'
import { closeTopModal } from './modules/modal.js'
import { audiofx } from './modules/audiofx.js'
import enUSLayout from './assets/keyboards/en-US.json'

console.log('[renderer] main.js imports ok, eDEX=', typeof window.eDEX)

async function startUI() {
  // body.classList.remove('booting') 延迟到 startFadeIn（所有模块就绪后），避免半成品界面暴露

  // 1) 应用主题（注入 CSS 变量 + 加载字体），拿到 xterm 配色
  const termTheme = await applyTheme(DEFAULT_THEME)

  // 多终端管理器（替代单终端 term/ws/cd 同步代码）
  const tm = new TerminalManager({ termTheme })

  // 保持终端焦点
  const focusTerm = () => { tm.focus() }

  // 虚拟键盘点击输入
  const sendInput = (data) => { tm.sendInput(data) }

  // 文件浏览器右键 "终端 cd 到此处"：把 cd 命令发给当前终端
  window.addEventListener('fs-terminal-cd', (e) => {
    if (!e.detail || !e.detail.path) return
    const p = e.detail.path
    const cmd = /^[A-Za-z]:$/.test(p) ? (p + '\\') : p
    tm.sendInput('cd ' + cmd + '\n')
  })

  // resize 防抖
  let _resizeTimer = null
  window.addEventListener('resize', () => {
    if (_resizeTimer) clearTimeout(_resizeTimer)
    _resizeTimer = setTimeout(() => {
      const t = tm.getCurrentTerm()
      if (t) { try { t.fit.fit() } catch {} }
      tm.resize(t ? t.xterm.cols : 80, t ? t.xterm.rows : 24)
    }, 200)
  })

  // 3) 模块初始化错峰（启动卡顿修复）：每 50ms 初始化一个模块，避免所有构造函数 + 3.2MB 图标
  //    动态 import + WebGL 在同一帧集中爆发。模块全部就绪后才启动遥测订阅与淡入动画。
  const mods = [
    ['Clock', () => new Clock('mod_column_left')],
    ['Sysinfo', () => new Sysinfo('mod_column_left')],
    ['HardwareInspector', () => new HardwareInspector('mod_column_left')],
    ['Cpuinfo', () => new Cpuinfo('mod_column_left')],
    ['RAMwatcher', () => new RAMwatcher('mod_column_left')],
    ['Toplist', () => new Toplist('mod_column_left')],
    ['Netstat', () => new Netstat('mod_column_right')],
    ['LocationGlobe', () => new LocationGlobe('mod_column_right')],
    ['Conninfo', () => new Conninfo('mod_column_right')],
    ['Filesystem', () => new Filesystem('filesystem')],
    ['Keyboard', () => new Keyboard({
      container: 'keyboard',
      layout: enUSLayout,
      input: sendInput,
      focus: focusTerm,
      shortcuts: [],
      onAppShortcut: () => {}
    })]
  ]
  let _modIdx = 0
  // 提前播 expand 音效（不依赖模块就绪，避免被错峰队列延迟）
  audiofx.play('expand')
  ;(function initNextMod() {
    if (_modIdx >= mods.length) {
      // 所有模块就绪 → 启动遥测 + 淡入动画
      initTelemetry()
      startFadeIn()
      return
    }
    const [name, fn] = mods[_modIdx++]
    try { fn() } catch (e) { console.error(`[renderer] module ${name} failed:`, e) }
    setTimeout(initNextMod, 50)
  })()

  function startFadeIn() {
    // 移除 booting 状态（所有模块就绪后才暴露界面，避免半成品瑕疵）
    document.body.classList.remove('booting')
    // 4) 列淡入动画（复用原版 mod_column.css 的 fadeIn，错峰播放 panels 音效）
    document.querySelectorAll('.mod_column').forEach((e) => e.classList.add('activated'))
    const left = document.querySelectorAll('#mod_column_left > div')
    const right = document.querySelectorAll('#mod_column_right > div')
    let i = 0
    const x = setInterval(() => {
      if (!left[i] && !right[i]) { clearInterval(x); return }
      audiofx.play('panels')
      if (left[i]) left[i].style.animationPlayState = 'running'
      if (right[i]) right[i].style.animationPlayState = 'running'
      i++
    }, 500)

    // 5) 底部文件浏览器 / 键盘淡入
    const fsel = document.getElementById('filesystem')
    const kbel = document.getElementById('keyboard')
    if (fsel) fsel.style.opacity = '1'
    if (kbel) {
      kbel.style.opacity = '1'
      kbel.classList.add('animation_state_1')
      void kbel.offsetWidth
      kbel.classList.add('animation_state_2')
    }
    // expand 音效已在模块初始化前提前播放，此处不再重复

    // 启动后静默检查更新 + 加载设置
    checkForUpdates()
    window.eDEX.readSettings().then((r) => { window.__edexSettings = r.settings }).catch(() => {})

  /*
  // 欢迎语功能已禁用（保留代码供后续启用）
  function showWelcome() {
    const s = window.__edexSettings || {}
    const msg = s.welcomeMsg
    if (!msg || !term) return
    try {
      const home = window.__edexSettings && window.__edexSettings.cwd
      const user = (home || '').split(/[\\/]+/).filter(Boolean).pop() || 'user'
      const line = msg.replace(/\{user\}/g, user)
      term.writeln('')
      term.writeln('\x1b[1;3' + (3) + 'm' + line + '\x1b[0m')
    } catch (_) {}
  }
  setTimeout(showWelcome, 2000)
  */

    // 热重载：设置面板保存后，应用到运行中的模块（不重启）
    window.addEventListener('settings-hot-reload', async (e) => {
      const d = e.detail || {}
      // 更新运行时全局
      window.__edexSettings = d
      // 终端字号：热更新 xterm
      if (d.termFontSize) {
        try { tm.setFontSize(d.termFontSize) } catch (_) {}
      }
      // 音频：通知 audiofx
      if (typeof d.audio !== 'undefined') {
        audiofx.setEnabled(d.audio)
        audiofx.setVolume(d.audioVolume != null ? d.audioVolume : 1.0)
        // audioAmp 需要重建音频实例才能生效，下次重启后生效
      }
      // 文件浏览器：列表/网格视图 + 隐藏点文件 + 动画速度
      const fsSection = document.getElementById('filesystem')
      if (fsSection) {
        if (typeof d.fsListView !== 'undefined') {
          fsSection.classList.toggle('list-view', d.fsListView === true)
        }
        if (typeof d.hideDotfiles !== 'undefined') {
          fsSection.classList.toggle('hideDotfiles', d.hideDotfiles === true)
        }
        // 动画速度：更新 CSS 变量
        if (d.animSpeed != null) {
          fsSection.style.setProperty('--anim-delay', d.animSpeed + 'ms')
          const container = document.getElementById('fs_disp_container')
          if (container) {
            container.style.setProperty('--anim-delay', d.animSpeed + 'ms')
            // 重新触发入场动画
            Array.from(container.children).forEach((el, i) => {
              el.style.animation = 'none'
              void el.offsetWidth
              el.style.animation = ''
              el.style.setProperty('--i', String(i))
            })
          }
        }
      }
      // 重现启动动画，确认设置已应用
      await runBootSequence(d.bootLogo)
      document.body.classList.remove('booting')
      document.querySelectorAll('.mod_column').forEach((e) => e.classList.add('activated'))
      // 重新聚焦终端
      focusTerm()
      // setTimeout(showWelcome, 2000)  // 欢迎语已禁用
      console.log('[renderer] settings hot-reloaded')
    })

    // 6) 全局快捷键 + ESC 菜单（设置/退出）
    let _menuOpen = false
    function showEscMenu() {
      if (window.__settingsOpen) return
      if (_menuOpen) return
      _menuOpen = true
      const overlay = document.createElement('div')
      overlay.id = 'esc-menu-overlay'
      overlay.innerHTML = `
        <style>
          #esc-menu-overlay {
            position: fixed; inset: 0; z-index: 99998;
            display: flex; align-items: center; justify-content: center;
            animation: escIn .15s ease;
          }
          @keyframes escIn { 0% { opacity: 0; } 100% { opacity: 1; } }
          #esc-menu-overlay .esc_bg {
            position: absolute; inset: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(2px);
          }
          #esc-menu-card {
            position: relative;
            background: var(--color_light_black, #0b0e14);
            border: 0.12vh solid rgb(var(--color_r), var(--color_g), var(--color_b));
            padding: 2.5vh 3vw;
            text-align: center;
            clip-path: polygon(0.6vh 0, 100% 0, 100% 100%, 0 100%, 0 0.6vh);
            animation: cardIn .2s ease;
            min-width: 18vw;
          }
          @keyframes cardIn { 0% { opacity: 0; transform: scale(0.9) translateY(-0.5vh); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
          #esc-menu-card h2 {
            font-size: 1.6vh; margin: 0 0 1.5vh 0; letter-spacing: 0.2vw;
            color: rgb(var(--color_r), var(--color_g), var(--color_b));
          }
          .esc_menu_btn {
            display: block; width: 100%; padding: 0.8vh 0;
            margin-bottom: 0.6vh;
            background: transparent;
            color: rgb(var(--color_r), var(--color_g), var(--color_b));
            border: 0.08vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.3);
            font-size: 1.3vh; font-family: var(--font_main);
            cursor: pointer; letter-spacing: 0.1vw;
            transition: all .1s ease;
          }
          .esc_menu_btn:hover { background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.12); border-color: rgb(var(--color_r), var(--color_g), var(--color_b)); }
          .esc_menu_btn:active { background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.25); }
          .esc_menu_btn.danger:hover { background: rgba(230,60,60,0.15); border-color: rgb(230,60,60); color: rgb(230,60,60); }
          #esc-menu-card .esc_hint { font-size: 0.9vh; opacity: 0.3; margin-top: 0.8vh; display: block; }
        </style>
        <div class="esc_bg"></div>
        <div id="esc-menu-card">
          <h2>${t('menu_title')}</h2>
          <button class="esc_menu_btn" id="esc-menu-settings">${t('menu_settings')}</button>
          <button class="esc_menu_btn" id="esc-menu-reload">${t('menu_reload')}</button>
          <button class="esc_menu_btn danger" id="esc-menu-exit">${t('menu_exit')}</button>
          <span class="esc_hint">${t('menu_esc')}</span>
        </div>`
      document.body.appendChild(overlay)

      const closeMenu = () => { overlay.remove(); _menuOpen = false }

      overlay.querySelector('.esc_bg').addEventListener('click', closeMenu)
      overlay.querySelector('#esc-menu-settings').addEventListener('click', () => { closeMenu(); openSettings() })
      overlay.querySelector('#esc-menu-reload').addEventListener('click', () => {
        closeMenu()
        window.dispatchEvent(new CustomEvent('settings-hot-reload', { detail: window.__edexSettings || {} }))
      })
      overlay.querySelector('#esc-menu-exit').addEventListener('click', () => {
        closeMenu()
        // 检测终端是否忙：5s 内有输入活动且未检测到提示符返回
        const busy = tm.isBusy()
        if (!busy) {
          if (window.eDEX.quitApp) window.eDEX.quitApp()
          return
        }
        // 忙 → 弹确认对话框
        const confirmOverlay = document.createElement('div')
        confirmOverlay.id = 'esc-menu-overlay'
        confirmOverlay.style.animation = 'none'
        confirmOverlay.innerHTML = `
          <style>
            #esc-menu-overlay {
              position: fixed; inset: 0; z-index: 99999;
              display: flex; align-items: center; justify-content: center;
              animation: escIn .15s ease;
            }
            @keyframes escIn { 0% { opacity: 0; } 100% { opacity: 1; } }
            #esc-menu-overlay .esc_bg {
              position: absolute; inset: 0;
              background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
            }
            #esc-menu-card {
              position: relative;
              background: var(--color_light_black, #0b0e14);
              border: 0.12vh solid rgb(var(--color_r), var(--color_g), var(--color_b));
              padding: 2.5vh 3vw; text-align: center;
              clip-path: polygon(0.6vh 0, 100% 0, 100% 100%, 0 100%, 0 0.6vh);
              animation: cardIn .2s ease;
              min-width: 20vw;
            }
            @keyframes cardIn { 0% { opacity: 0; transform: scale(0.9) translateY(-0.5vh); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
            #esc-menu-card h2 { font-size: 1.6vh; margin: 0 0 0.6vh 0; letter-spacing: 0.2vw; color: rgb(var(--color_r), var(--color_g), var(--color_b)); }
            #esc-menu-card p { font-size: 1.2vh; opacity: 0.6; margin: 0 0 1.5vh 0; }
            .esc_menu_btn {
              display: block; width: 100%; padding: 0.8vh 0; margin-bottom: 0.6vh;
              background: transparent;
              color: rgb(var(--color_r), var(--color_g), var(--color_b));
              border: 0.08vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.3);
              font-size: 1.3vh; font-family: var(--font_main);
              cursor: pointer; letter-spacing: 0.1vw;
              transition: all .1s ease;
            }
            .esc_menu_btn:hover { background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.12); border-color: rgb(var(--color_r), var(--color_g), var(--color_b)); }
            .esc_menu_btn:active { background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.25); }
            .esc_menu_btn.danger:hover { background: rgba(230,60,60,0.15); border-color: rgb(230,60,60); color: rgb(230,60,60); }
          </style>
          <div class="esc_bg"></div>
          <div id="esc-menu-card">
            <h2>${t('busy_title')}</h2>
            <p>${t('busy_desc')}</p>
            <button class="esc_menu_btn danger" id="confirm-exit-yes">${t('busy_yes')}</button>
            <button class="esc_menu_btn" id="confirm-exit-no">${t('busy_cancel')}</button>
          </div>`
        document.body.appendChild(confirmOverlay)
        confirmOverlay.querySelector('.esc_bg').addEventListener('click', () => confirmOverlay.remove())
        confirmOverlay.querySelector('#confirm-exit-yes').addEventListener('click', () => {
          confirmOverlay.remove()
          if (window.eDEX.quitApp) window.eDEX.quitApp()
        })
        confirmOverlay.querySelector('#confirm-exit-no').addEventListener('click', () => confirmOverlay.remove())
      })
    }

    // 6) 全局快捷键 + ESC（通用关闭键：Modal > 设置页 > 新建终端弹窗 > overlay > 菜单）
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return

      // 1) 有 Modal 弹窗 → 关闭最上层 Modal
      if (document.querySelector('.modal_popup')) {
        e.preventDefault(); e.stopPropagation()
        closeTopModal(); return
      }

      // 2) 新建终端弹窗（new-term-overlay）→ 关闭
      const newTermOverlay = document.getElementById('new-term-overlay')
      if (newTermOverlay) {
        e.preventDefault(); e.stopPropagation()
        newTermOverlay.remove()
        return
      }

      // 3) 设置页面打开 → 关闭设置
      if (window.__settingsOpen) {
        e.preventDefault(); e.stopPropagation()
        closeSettings(); return
      }

      // 4) 有 overlay（忙确认框/ESC 菜单）→ 关闭
      const anyOverlay = document.getElementById('esc-menu-overlay')
      if (anyOverlay) {
        e.preventDefault(); e.stopPropagation()
        anyOverlay.remove()
        _menuOpen = false
        return
      }

      // 5) 以上都没有 → 单次 ESC 打开菜单
      e.preventDefault(); e.stopPropagation()
      showEscMenu()
    }, true)

    setOnThemeChange((name) => {
      audiofx.play('theme')
      console.log('[renderer] theme switched to', name)
    })
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault()
        setTheme(nextTheme())
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault()
        new FuzzyFinder()
      }
    })

    // 启动完成后立即聚焦终端
    focusTerm()

    console.log('[renderer] UI ready, theme=', getCurrentTheme())
  }
}

async function boot() {
  // 先应用主题，再加载设置（让 boot 动画能读到自定义 logo），最后启动 UI
  await applyTheme(DEFAULT_THEME)
  try {
    const _sett = await window.eDEX.readSettings()
    window.__edexSettings = _sett.settings || {}
  } catch (_) { window.__edexSettings = {} }
  const _bootLogo = (window.__edexSettings && window.__edexSettings.bootLogo) || undefined
  try {
    await runBootSequence(_bootLogo)
  } catch (e) {
    console.error('[renderer] boot sequence failed:', e)
  }
  await startUI()
}

boot().catch((e) => console.error('[renderer] boot error', e))
