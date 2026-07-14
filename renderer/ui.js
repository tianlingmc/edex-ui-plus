// 渲染端 UI 辅助：统一的科幻面板（切角 + 主题色边框）创建函数

// 在 parentId 容器内追加一个面板，返回 body 容器供模块填充内容
export function makePanel(parentId, { id, title, sub = '' }) {
  const parent = document.getElementById(parentId)
  const sec = document.createElement('section')
  sec.className = 'panel augmented'
  sec.id = id
  sec.setAttribute('augmented-ui', 'bl-clip tr-clip exe')
  sec.innerHTML = `<h3 class="title"><p>${title}</p><p>${sub}</p></h3><div class="panel-body"></div>`
  parent.appendChild(sec)
  return sec.querySelector('.panel-body')
}

// 把 0-100 的数值渲染成一条主题色进度条
export function bar(pct) {
  const v = Math.max(0, Math.min(100, pct))
  return `<div class="bar"><i style="width:${v}%"></i></div>`
}

// 把字节数格式化为可读字符串
export function bytes(n) {
  if (!n && n !== 0) return '--'
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let i = 0
  let x = n
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i++ }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
}

// 仅在内容变化时才写入文本节点，避免无意义的 DOM 重排（高频刷新时关键）
export function setText(el, val) {
  const v = String(val)
  if (el && el.textContent !== v) el.textContent = v
}

// 仅在宽度变化时才写 style，避免每帧触发样式重算
export function setWidth(el, pct) {
  const v = Math.max(0, Math.min(100, pct)) + '%'
  if (el && el.style.width !== v) el.style.width = v
}

// 创建原始 eDEX-UI 模块根节点 <div id="..."> 并挂到列容器。
// 必须是列容器的直接 <div> 子节点，才能匹配 mod_*.css 选择器，并触发 mod_column.css 的 fadeIn 动画。
export function mountMod(parentId, id, html) {
  const parent = document.getElementById(parentId)
  const root = document.createElement('div')
  root.id = id
  root.innerHTML = html
  parent.appendChild(root)
  return root
}

// 读取当前主题色（rgb(r, g, b)），供 canvas 图表使用。
export function themeRGB() {
  const s = getComputedStyle(document.documentElement)
  const r = (s.getPropertyValue('--color_r') || '').trim() || '170'
  const g = (s.getPropertyValue('--color_g') || '').trim() || '207'
  const b = (s.getPropertyValue('--color_b') || '').trim() || '209'
  return `rgb(${r}, ${g}, ${b})`
}
