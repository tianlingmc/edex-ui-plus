import { mountMod, setText, themeRGB } from '../ui.js'
import { onTelemetry } from '../telemetry.js'
import { StreamChart } from './streamChart.js'

// CPU 信息（原 cpuinfo.class.js）：型号 / 平均负载(两半) / 温度(非 win) / 频率 / 任务数。改为订阅遥测。
export class Cpuinfo {
  constructor(parentId) {
    const win32 = !!(window.eDEX && window.eDEX.platform === 'win32')
    this.win32 = win32
    const label = win32 ? 'CORES' : 'TEMP'
    // innerHTML 仅构建一次，divide/cores 用占位值，待 d.cpu 到达后填充
    const root = mountMod(parentId, 'mod_cpuinfo', `
      <div id="mod_cpuinfo_innercontainer">
        <h1>CPU USAGE<i id="mod_cpuinfo_cpuname">--</i></h1>
        <div>
          <h1># <em>1</em> - <em class="mod_cpuinfo_divide">0</em><br>
          <i id="mod_cpuinfo_usagecounter0">Avg. --%</i></h1>
          <canvas id="mod_cpuinfo_canvas_0" height="60"></canvas>
        </div>
        <div>
          <h1># <em class="mod_cpuinfo_divide2">1</em> - <em id="mod_cpuinfo_cores">0</em><br>
          <i id="mod_cpuinfo_usagecounter1">Avg. --%</i></h1>
          <canvas id="mod_cpuinfo_canvas_1" height="60"></canvas>
        </div>
        <div>
          <div><h1>${label}<br><i id="mod_cpuinfo_temp">--°C</i></h1></div>
          <div><h1>SPD<br><i id="mod_cpuinfo_speed_min">--GHz</i></h1></div>
          <div><h1>MAX<br><i id="mod_cpuinfo_speed_max">--GHz</i></h1></div>
          <div><h1>TASKS<br><i id="mod_cpuinfo_tasks">---</i></h1></div>
        </div>
      </div>`)
    this.root = root
    this.cpunameEl = root.querySelector('#mod_cpuinfo_cpuname')
    this.divideEl = root.querySelector('.mod_cpuinfo_divide')
    this.divide2El = root.querySelector('.mod_cpuinfo_divide2')
    this.coresEl = root.querySelector('#mod_cpuinfo_cores')
    this.usage0El = root.querySelector('#mod_cpuinfo_usagecounter0')
    this.usage1El = root.querySelector('#mod_cpuinfo_usagecounter1')
    this.tempEl = root.querySelector('#mod_cpuinfo_temp')
    this.speedMinEl = root.querySelector('#mod_cpuinfo_speed_min')
    this.speedMaxEl = root.querySelector('#mod_cpuinfo_speed_max')
    this.tasksEl = root.querySelector('#mod_cpuinfo_tasks')
    this.chart0 = null
    this.chart1 = null
    this.divide = 0
    this.cores = 0

    onTelemetry((d) => this.render(d))
  }

  render(d) {
    if (!this.chart0) {
      this.chart0 = new StreamChart(this.root.querySelector('#mod_cpuinfo_canvas_0'), { min: 0, max: 100, color: themeRGB() })
      this.chart1 = new StreamChart(this.root.querySelector('#mod_cpuinfo_canvas_1'), { min: 0, max: 100, color: themeRGB() })
    }
    if (!d) return

    if (d.cpu) {
      this.cores = d.cpu.cores || 0
      this.divide = Math.floor(this.cores / 2)
      const name = `${d.cpu.manufacturer || ''}${d.cpu.brand || ''}`.substring(0, 30)
      setText(this.cpunameEl, name)
      setText(this.divideEl, this.divide)
      setText(this.divide2El, this.divide + 1)
      setText(this.coresEl, this.cores)
      setText(this.speedMinEl, `${d.cpu.speed}GHz`)
      setText(this.speedMaxEl, `${d.cpu.speedMax}GHz`)
      if (this.win32) setText(this.tempEl, String(this.cores))
    }

    if (d.currentLoad && d.currentLoad.cpus && d.currentLoad.cpus.length) {
      const cpus = d.currentLoad.cpus
      const div = this.divide || Math.floor(cpus.length / 2)
      const first = cpus.slice(0, div)
      const second = cpus.slice(div)
      const avg = (arr) => arr.length
        ? Math.round(arr.reduce((s, c) => s + (c.load || 0), 0) / arr.length)
        : 0
      const avg0 = avg(first)
      const avg1 = avg(second)
      setText(this.usage0El, `Avg. ${avg0}%`)
      setText(this.usage1El, `Avg. ${avg1}%`)
      this.chart0.push(avg0)
      this.chart1.push(avg1)
    }

    if (d.temp != null && !this.win32) setText(this.tempEl, `${d.temp}°C`)
    if (d.processes && typeof d.processes.all === 'number') setText(this.tasksEl, String(d.processes.all))
  }
}
