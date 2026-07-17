// 启动动画：复用原版 _renderer.js 的 displayLine / displayTitleScreen 逻辑
// 适配安全架构：boot_log.txt 经 fetch 读取（已在 public/misc），音效走 audiofx，主题色读 CSS 变量。
// 启动期间通过 body.booting 隐藏其它面板（原版是“启动后才动态创建 UI”，本工程面板是静态 HTML，
// 故用 booting 类等效隐藏，避免透明 boot 遮罩下透出面板）。
import { audiofx } from './modules/audiofx.js'

const _delay = (ms) => new Promise((r) => setTimeout(r, ms))

function themeRGB() {
  const s = getComputedStyle(document.documentElement)
  const r = (s.getPropertyValue('--color_r') || '170').trim()
  const g = (s.getPropertyValue('--color_g') || '207').trim()
  const b = (s.getPropertyValue('--color_b') || '209').trim()
  return `${r}, ${g}, ${b}`
}

async function getBootLog() {
  try {
    const res = await fetch('misc/boot_log.txt')
    if (!res.ok) return []
    return (await res.text()).split('\n')
  } catch (e) {
    return []
  }
}

async function displayTitleScreen(screen, logoText, keep = false) {
  audiofx.play('theme')
  await _delay(400)
  document.body.classList.remove('solidBackground')
  screen.setAttribute('class', 'center')
  const text = logoText || (window.__edexSettings && window.__edexSettings.bootLogo) || 'eDEX-UI-Plus'
  screen.innerHTML = '<h1 data-logo="' + text.replace(/"/g, '&quot;') + '">' + text + '</h1>'
  const title = screen.querySelector('h1')
  const rgb = themeRGB()

  await _delay(200)
  document.body.classList.add('solidBackground')

  await _delay(100)
  title.setAttribute('style', `background-color: rgb(${rgb});border-bottom: 5px solid rgb(${rgb});`)

  await _delay(300)
  title.setAttribute('style', `border: 5px solid rgb(${rgb});`)

  await _delay(100)
  title.setAttribute('style', '')
  title.setAttribute('class', 'glitch')

  await _delay(500)
  document.body.classList.remove('solidBackground')
  title.setAttribute('class', '')
  title.setAttribute('style', `border: 5px solid rgb(${rgb});`)

  await _delay(1000)
  if (!keep && screen.parentNode) screen.remove()
}

// 运行完整启动序列：滚动 boot 日志 -> 标题故障动画 -> 移除遮罩
export async function runBootSequence(logoOverride) {
  // 读取自定义 logo（优先参数，其次全局设置，最后默认值）
  const logo = logoOverride || (window.__edexSettings && window.__edexSettings.bootLogo) || 'eDEX-UI-Plus'
  // 进入 booting 状态：隐藏所有面板，仅显示启动遮罩
  document.body.classList.add('booting')

  let screen = document.getElementById('boot_screen')
  if (!screen) {
    screen = document.createElement('section')
    screen.id = 'boot_screen'
    screen.style.zIndex = '9999999'
    document.body.appendChild(screen)
  }
  screen.innerHTML = ''
  document.body.classList.add('solidBackground')

  let skipped = false
  const skip = () => { skipped = true }
  window.addEventListener('keydown', skip, { once: true })
  screen.addEventListener('click', skip, { once: true })

  const log = await getBootLog()
  let i = 0
  const displayLine = async () => {
    if (skipped) { await displayTitleScreen(screen, logo); return }
    if (typeof log[i] === 'undefined') {
      await _delay(300)
      await displayTitleScreen(screen, logo)
      return
    }
    if (log[i] === 'Boot Complete') audiofx.play('granted')
    else audiofx.play('stdout')
    screen.innerHTML += log[i] + '<br/>'
    i++
    if (skipped) { await displayTitleScreen(screen, logo); return }

    // 与原版一致的逐行节奏
    let d
    if (i === 4) d = 500
    else if (i > 4 && i < 25) d = 30
    else if (i === 25) d = 400
    else if (i === 42) d = 300
    else if (i > 42 && i < 82) d = 25
    else if (i === 83) d = 25
    else if (i >= log.length - 2 && i < log.length) d = 300
    else d = Math.pow(1 - (i / 1000), 3) * 25

    await _delay(d)
    await displayLine()
  }
  await displayLine()
  // booting 保留到 startUI 接管后再移除（由 main.js 在 applyTheme 后移除），
  // 保证面板淡入动画开始前不被提前显示。
}

// 关机时重放 logo 故障动画（不移除 screen，交由调用方淡出）
export async function replayLogo() {
  const logo = (window.__edexSettings && window.__edexSettings.bootLogo) || 'eDEX-UI-Plus'
  let screen = document.getElementById('boot_screen')
  if (!screen) {
    screen = document.createElement('section')
    screen.id = 'boot_screen'
    document.body.appendChild(screen)
  }
  screen.style.zIndex = '9999999'
  document.body.classList.add('booting')   // 隐藏其它面板，仅留 logo
  await displayTitleScreen(screen, logo, true)
  return screen
}
