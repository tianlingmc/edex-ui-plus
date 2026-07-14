import { mountMod } from '../ui.js'

// 时钟（对齐原版）：大号 HH:MM:SS，每位数字独立 span、冒号 em
export class Clock {
  constructor(parentId) {
    const root = mountMod(parentId, 'mod_clock',
      '<h1 id="mod_clock_text"><span>0</span><span>0</span><em>:</em><span>0</span><span>0</span><em>:</em><span>0</span><span>0</span></h1>')
    this.spans = Array.from(root.querySelectorAll('#mod_clock_text span'))
    this.update()
    this.updater = setInterval(() => this.update(), 1000)
  }
  update() {
    const t = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const s = `${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`
    let di = 0
    for (const c of s) {
      if (c === ':') continue
      if (di < this.spans.length) this.spans[di++].textContent = c
    }
  }
}
