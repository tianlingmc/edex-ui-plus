import { mountMod, setText } from '../ui.js'
import { onTelemetry } from '../telemetry.js'

const GIB = 1073742000 // 与原版一致的人造换算常量

// 内存监控（原 ramwatcher.class.js）：点阵图 + SWAP 进度条。改为订阅遥测。
export class RAMwatcher {
  constructor(parentId) {
    const root = mountMod(parentId, 'mod_ramwatcher', `
      <div id="mod_ramwatcher_inner">
        <h1>MEMORY<i id="mod_ramwatcher_info"></i></h1>
        <div id="mod_ramwatcher_pointmap">
          ${Array.from({ length: 440 }).map(() => '<div class="mod_ramwatcher_point free"></div>').join('')}
        </div>
        <div id="mod_ramwatcher_swapcontainer">
          <h1>SWAP</h1>
          <progress id="mod_ramwatcher_swapbar" max="100" value="0"></progress>
          <h3 id="mod_ramwatcher_swaptext">0.0 GiB</h3>
        </div>
      </div>`)
    this.infoEl = root.querySelector('#mod_ramwatcher_info')
    this.points = Array.from(root.querySelectorAll('div.mod_ramwatcher_point'))
    // 原版会打乱点序，这里同样打乱以避免“先填充前 N 个”的视觉偏差
    this.points.sort(() => Math.random() - 0.5)
    this.swapbar = root.querySelector('#mod_ramwatcher_swapbar')
    this.swaptext = root.querySelector('#mod_ramwatcher_swaptext')

    onTelemetry((d) => this.render(d))
  }

  render(d) {
    if (!d || !d.mem) return
    const m = d.mem
    const totalGiB = Math.round(m.total / GIB * 10) / 10
    const usedGiB = Math.round(m.active / GIB * 10) / 10
    setText(this.infoEl, `USING ${usedGiB} OUT OF ${totalGiB} GiB`)

    const total = m.total || 1
    let activePts = Math.round(440 * m.active / total)
    let freePts = Math.round(440 * m.free / total)
    let availablePts = 440 - activePts - freePts
    if (availablePts < 0) availablePts = 0

    const pts = this.points
    for (let i = 0; i < pts.length; i++) {
      let cls = 'mod_ramwatcher_point free'
      if (i < activePts) cls = 'mod_ramwatcher_point active'
      else if (i < activePts + availablePts) cls = 'mod_ramwatcher_point available'
      if (pts[i].className !== cls) pts[i].setAttribute('class', cls)
    }

    let usedSwap = 0
    if (m.swapTotal) usedSwap = Math.round(100 * m.swapUsed / m.swapTotal)
    if (this.swapbar.value !== usedSwap) this.swapbar.value = usedSwap
    const swapGiB = Math.round(m.swapUsed / GIB * 10) / 10
    setText(this.swaptext, `${swapGiB} GiB`)
  }
}
