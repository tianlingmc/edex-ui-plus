import { mountMod, setText } from '../ui.js'
import { onTelemetry } from '../telemetry.js'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// 系统信息（原 sysinfo.class.js）：日期 / 运行时长 / 平台 / 电池。改为订阅遥测。
export class Sysinfo {
  constructor(parentId) {
    const root = mountMod(parentId, 'mod_sysinfo', `
      <div><h1>1970</h1><h2>JAN 1</h2></div>
      <div><h1>UPTIME</h1><h2>0d 00:00</h2></div>
      <div><h1>TYPE</h1><h2>win</h2></div>
      <div><h1>POWER</h1><h2>00%</h2></div>`)
    this.yearEl = root.querySelector('#mod_sysinfo > div:first-child > h1')
    this.dateEl = root.querySelector('#mod_sysinfo > div:first-child > h2')
    this.uptimeEl = root.querySelector('#mod_sysinfo > div:nth-child(2) > h2')
    this.typeEl = root.querySelector('#mod_sysinfo > div:nth-child(3) > h2')
    this.powerEl = root.querySelector('#mod_sysinfo > div:last-child > h2')

    this.updateDate()
    setInterval(() => this.updateDate(), 60000)

    // TYPE：平台映射，设置一次
    const p = (window.eDEX && window.eDEX.platform) || 'linux'
    this.typeEl.textContent = p === 'darwin' ? 'macOS' : p === 'win32' ? 'win' : p

    onTelemetry((d) => this.render(d))
  }

  updateDate() {
    const now = new Date()
    setText(this.yearEl, String(now.getFullYear()))
    setText(this.dateEl, `${MONTHS[now.getMonth()]} ${now.getDate()}`)
  }

  render(d) {
    if (!d) return
    if (typeof d.sysUptime === 'number') {
      const s = Math.floor(d.sysUptime)
      const days = Math.floor(s / 86400)
      const hours = Math.floor((s % 86400) / 3600)
      const mins = Math.floor((s % 3600) / 60)
      const pad = (n) => String(n).padStart(2, '0')
      setText(this.uptimeEl, `${days}d ${pad(hours)}:${pad(mins)}`)
    }
    if (d.battery == null) {
      setText(this.powerEl, 'ON')
    } else {
      const b = d.battery
      if (b.hasBattery === false) setText(this.powerEl, 'ON')
      else if (b.isCharging) setText(this.powerEl, 'CHARGE')
      else if (b.acConnected) setText(this.powerEl, 'WIRED')
      else setText(this.powerEl, `${Math.round(b.percent)}%`)
    }
  }
}
