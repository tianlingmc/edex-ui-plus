// 极简流式折线图（沙箱安全，无外部依赖）：环形缓冲 + canvas 绘制，
// 用于 CPU 负载 / 网络上下行速率等实时曲线，还原原版 smoothie 图表的视觉效果。
// mirror 模式：0 为中线，正值向上、负值向下，支持第二条曲线（如 RX 下行）。
export class StreamChart {
  constructor(canvas, opts = {}) {
    this.canvas = canvas
    this.min = opts.min ?? 0
    this.max = opts.max ?? 100
    this.autoScale = !!opts.autoScale
    this.mirror = !!opts.mirror    // 镜像模式
    this.color = opts.color || null
    this.color2 = opts.color2 || null // 第二条曲线颜色
    this.cap = opts.cap || 120
    this.data = []
    this.data2 = [] // 第二条曲线（mirror 模式用）
    this.ctx = canvas.getContext('2d')
    this.w = 0
    this.h = 0
    this.resize()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = 2
    this.canvas.width = Math.round(rect.width * dpr)
    this.canvas.height = Math.round(rect.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.w = rect.width
    this.h = rect.height
  }

  push(v, v2) {
    if (typeof v !== 'number' || Number.isNaN(v)) return
    this.data.push(v)
    if (this.data.length > this.cap) this.data.shift()
    if (this.mirror && v2 !== undefined) {
      this.data2.push(v2)
      if (this.data2.length > this.cap) this.data2.shift()
    }
    this.draw()
  }

  draw() {
    if (!this.w) this.resize()
    if (!this.w) return
    const c = this.ctx
    c.clearRect(0, 0, this.w, this.h)
    const n = this.data.length
    if (n < 2) return

    const color = this.color || 'rgb(170,207,209)'
    const color2 = this.color2 || 'rgb(170,207,209)'
    const xFor = (i) => (i / (this.cap - 1)) * this.w

    if (this.mirror) {
      const cy = this.h / 2
      let hi = this.max
      if (this.autoScale) {
        const all = [...this.data, ...(this.data2.length ? this.data2.map(v => Math.abs(v)) : [])]
        hi = Math.max(0.1, ...all) * 1.2
        if (!isFinite(hi) || hi <= 0) hi = 1
      }
      const scale = (hi > 0) ? (cy * 0.9 / hi) : 1
      const n2 = this.data2.length

      // 网格线（对齐原版 smoothie：水平 3 段 + 中线）
      c.strokeStyle = color
      c.globalAlpha = 0.15
      c.lineWidth = 0.5
      for (let s = 1; s <= 3; s++) {
        const y = cy * (1 - s / 4)
        c.beginPath(); c.moveTo(0, y); c.lineTo(this.w, y); c.stroke()
        c.beginPath(); c.moveTo(0, this.h - y); c.lineTo(this.w, this.h - y); c.stroke()
      }
      c.globalAlpha = 1

      // 数值标签（右侧，对齐原版 smoothie 的 labels）
      c.font = '9px monospace'
      c.textAlign = 'right'
      c.globalAlpha = 0.8
      const txVal = n > 0 ? this.data[n - 1] : 0
      const rxVal = n2 > 0 ? this.data2[n2 - 1] : 0
      c.fillStyle = color
      c.fillText(txVal.toFixed(2), this.w - 2, cy * 0.32 + 3)
      c.fillStyle = color2
      c.fillText(rxVal.toFixed(2), this.w - 2, this.h - cy * 0.32 + 3)
      c.globalAlpha = 1

      // 绘制 TX（正值，向上）
      if (n >= 2) {
        const y0 = cy - this.data[0] * scale
        c.beginPath()
        c.moveTo(xFor(0), y0)
        for (let i = 1; i < n; i++) c.lineTo(xFor(i), cy - this.data[i] * scale)
        for (let i = n - 1; i >= 0; i--) c.lineTo(xFor(i), cy)
        c.closePath()
        c.globalAlpha = 0.12
        c.fillStyle = color
        c.fill()
        c.globalAlpha = 1
        c.beginPath()
        c.moveTo(xFor(0), cy - this.data[0] * scale)
        for (let i = 1; i < n; i++) c.lineTo(xFor(i), cy - this.data[i] * scale)
        c.strokeStyle = color
        c.lineWidth = 1.5
        c.stroke()
      }

      // 绘制 RX（负值，向下）
      if (n2 >= 2) {
        const y0 = cy + this.data2[0] * scale
        c.beginPath()
        c.moveTo(xFor(0), y0)
        for (let i = 1; i < n2; i++) c.lineTo(xFor(i), cy + this.data2[i] * scale)
        for (let i = n2 - 1; i >= 0; i--) c.lineTo(xFor(i), cy)
        c.closePath()
        c.globalAlpha = 0.12
        c.fillStyle = color2
        c.fill()
        c.globalAlpha = 1
        c.beginPath()
        c.moveTo(xFor(0), cy + this.data2[0] * scale)
        for (let i = 1; i < n2; i++) c.lineTo(xFor(i), cy + this.data2[i] * scale)
        c.strokeStyle = color2
        c.lineWidth = 1.5
        c.stroke()
      }

      // 中线
      c.strokeStyle = color
      c.globalAlpha = 0.2
      c.lineWidth = 0.5
      c.beginPath()
      c.moveTo(0, cy)
      c.lineTo(this.w, cy)
      c.stroke()
      c.globalAlpha = 1
    } else {
      // 普通模式
      let lo = this.min
      let hi = this.max
      if (this.autoScale) {
        hi = Math.max(this.max, ...this.data) * 1.1
        if (!isFinite(hi) || hi <= lo) hi = lo + 1
      }
      const yFor = (val) => this.h - ((val - lo) / (hi - lo)) * this.h

      // 填充区域
      c.beginPath()
      c.moveTo(xFor(0), yFor(this.data[0]))
      for (let i = 1; i < n; i++) c.lineTo(xFor(i), yFor(this.data[i]))
      c.lineTo(xFor(n - 1), this.h)
      c.lineTo(xFor(0), this.h)
      c.closePath()
      c.globalAlpha = 0.12
      c.fillStyle = color
      c.fill()
      c.globalAlpha = 1

      // 折线
      c.beginPath()
      c.moveTo(xFor(0), yFor(this.data[0]))
      for (let i = 1; i < n; i++) c.lineTo(xFor(i), yFor(this.data[i]))
      c.strokeStyle = color
      c.lineWidth = 1.5
      c.stroke()
    }
  }
}
