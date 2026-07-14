import { mountMod, bytes, setText, themeRGB } from '../ui.js'
import { onTelemetry } from '../telemetry.js'
import { StreamChart } from './streamChart.js'

// 网络连接速率（原 conninfo.class.js）：出口网卡 rx/tx 每秒速率 + 累计总量 + 镜像折线图。
// TX（上行）正值向上、RX（下行）负值向下，对齐原版 smoothie 镜像布局。
// 启动期间（无数据或数据全 0）不绘制图表，避免初始 0 段把真实值压扁在左下角。
export class Conninfo {
  constructor(parentId) {
    const root = mountMod(parentId, 'mod_conninfo', `
      <div id="mod_conninfo_innercontainer">
        <h1>NETWORK TRAFFIC<i>UP / DOWN, MB/S</i></h1>
        <h2>TOTAL<i>0B OUT, 0B IN</i></h2>
        <canvas id="mod_conninfo_canvas"></canvas>
        <h3>OFFLINE</h3>
      </div>`)
    this.root = root
    this.current = root.querySelector('#mod_conninfo_innercontainer > h1 > i')
    this.total = root.querySelector('#mod_conninfo_innercontainer > h2 > i')
    this.stateEl = root.querySelector('#mod_conninfo_innercontainer > h3')
    this.totalTx = 0
    this.totalRx = 0
    this.chart = null
    this._skipped = 0

    onTelemetry((d) => this.render(d))
  }

  render(d) {
    if (!this.chart) {
      const canvas = this.root.querySelector('#mod_conninfo_canvas')
      if (!canvas) return
      const c = themeRGB()
      this.chart = new StreamChart(canvas, {
        mirror: true,
        autoScale: true,
        cap: 60, // 1 分钟窗口
        color: c,
        color2: c.replace('rgb(', 'rgba(').replace(')', ', 0.35)')
      })
    }
    if (!d || !d.net || !d.net.iface) {
      this.root.setAttribute('class', 'offline')
      setText(this.stateEl, 'OFFLINE')
      this._skipped++
      return
    }
    const txMB = (d.net.tx_sec || 0) / 125000
    const rxMB = (d.net.rx_sec || 0) / 125000
    // 跳过启动期 0 段（前 5 条全 0 数据视为尚在初始化），不推入 chart
    if (this._skipped < 5 && txMB === 0 && rxMB === 0) {
      this._skipped++
      return
    }
    // ONLINE：移除 offline 类，h3 留空隐藏（CSS opacity:0），网卡名写 h1 的 i 标签
    this.root.setAttribute('class', '')
    setText(this.stateEl, '')
    setText(this.current, `UP ${txMB.toFixed(2)} DOWN ${rxMB.toFixed(2)}  [${d.net.iface}]`)
    this.totalTx += d.net.tx_sec || 0
    this.totalRx += d.net.rx_sec || 0
    this.total.innerText = `${bytes(this.totalTx)} OUT, ${bytes(this.totalRx)} IN`.toUpperCase()
    this.chart.push(txMB, rxMB)
  }
}
