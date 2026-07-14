// 主题系统：从 /themes/<name>.json 加载，注入 CSS 变量，加载字体，返回 xterm 主题
// 原 eDEX-UI 主题 schema 只有 colors / cssvars / terminal / globe / injectCSS 五个顶层 key

export const THEME_NAMES = [
  'apollo', 'apollo-notype', 'blade', 'chalkboard', 'chalkboard-ligatures',
  'chalkboard-notype', 'cyborg', 'cyborg-focus', 'interstellar', 'matrix',
  'navy', 'navy-disrupted', 'navy-notype', 'nord', 'red', 'tron',
  'tron-colorfilter', 'tron-disrupted', 'tron-fulltype', 'tron-notype', 'tron-typeleft'
]

export const DEFAULT_THEME = 'tron'

let currentTheme = DEFAULT_THEME
let termInstance = null
let onChange = null

export function getCurrentTheme() { return currentTheme }
export function setOnThemeChange(fn) { onChange = fn }
export function setTermInstance(term) { termInstance = term }

export function nextTheme() {
  const idx = THEME_NAMES.indexOf(currentTheme)
  const next = THEME_NAMES[(idx + 1) % THEME_NAMES.length]
  return next
}

export async function setTheme(name) {
  if (!THEME_NAMES.includes(name)) return currentTheme
  currentTheme = name
  const terminalTheme = await applyTheme(name)
  if (termInstance) {
    termInstance.options.theme = terminalTheme
    // xterm 在字体变化后可能需要刷新
    if (terminalTheme.fontFamily) termInstance.options.fontFamily = terminalTheme.fontFamily
  }
  if (onChange) onChange(name, terminalTheme)
  return name
}
// 字体名 -> woff2 文件名（与原项目一致：小写 + 空格转下划线）
function fontFile(family) {
  return (family || 'Fira Mono').toLowerCase().replace(/ /g, '_') + '.woff2'
}

async function loadFont(family) {
  try {
    const ff = new FontFace(family, `url(./fonts/${fontFile(family)})`)
    await ff.load()
    document.fonts.add(ff)
  } catch (e) {
    console.warn('[theme] font load failed:', family, e.message)
  }
}

export async function fetchTheme(name) {
  const res = await fetch(`./themes/${name}.json`)
  if (!res.ok) throw new Error(`theme ${name} not found (${res.status})`)
  return res.json()
}

// 应用主题：加载字体 + 注入 <style class="theming"> + 暴露 window.theme，返回 xterm 主题对象
export async function applyTheme(name) {
  const theme = await fetchTheme(name)
  await Promise.all([
    loadFont(theme.cssvars?.font_main || 'Fira Mono'),
    loadFont(theme.cssvars?.font_main_light || 'Fira Mono'),
    loadFont(theme.terminal?.fontFamily || 'Fira Mono')
  ])

  const old = document.querySelector('style.theming')
  if (old) old.remove()

  const c = theme.colors || {}
  const style = document.createElement('style')
  style.className = 'theming'
  style.textContent = `
    :root {
      --color_r: ${c.r ?? 170};
      --color_g: ${c.g ?? 207};
      --color_b: ${c.b ?? 209};
      --color_black: ${c.black || '#000000'};
      --color_light_black: ${c.light_black || '#05080d'};
      --color_grey: ${c.grey || '#262828'};
      --font_main: "${theme.cssvars?.font_main || 'Fira Mono'}";
      --font_main_light: "${theme.cssvars?.font_main_light || 'Fira Mono'}";
      --font_mono: "${theme.terminal?.fontFamily || 'Fira Mono'}";
    }
    body { font-family: var(--font_main), sans-serif; }
    ${theme.injectCSS || ''}
  `
  document.head.appendChild(style)
  window.theme = theme
  return theme.terminal || {}
}
