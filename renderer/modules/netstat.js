import { mountMod, setText } from '../ui.js'
import { onTelemetry } from '../telemetry.js'

// 网络状态（原 netstat.class.js 精简）：活动网卡 STATE / IPv4 / PING。改为订阅遥测。
export class Netstat {
  constructor(parentId) {
    const root = mountMod(parentId, 'mod_netstat', `
      <div id="mod_netstat_inner">
        <h1>NETWORK STATUS<i id="mod_netstat_iname">Interface: (offline)</i></h1>
        <div id="mod_netstat_innercontainer">
          <div><h1>STATE</h1><h2>UNKNOWN</h2></div>
          <div><h1>IPv4</h1><h2>--.--.--.--</h2></div>
          <div><h1>PING</h1><h2>--ms</h2></div>
        </div>
      </div>`)
    this.inameEl = root.querySelector('#mod_netstat_iname')
    this.stateEl = root.querySelector('#mod_netstat_innercontainer > div:nth-child(1) > h2')
    this.ipv4El = root.querySelector('#mod_netstat_innercontainer > div:nth-child(2) > h2')
    this.pingEl = root.querySelector('#mod_netstat_innercontainer > div:nth-child(3) > h2')
    this.last = {}

    onTelemetry((d) => this.render(d))
  }

  _set(key, el, val) {
    if (this.last[key] !== val) {
      setText(el, val)
      this.last[key] = val
    }
  }

  render(d) {
    if (!d) return
    const iface = d.net && d.net.iface
    if (iface) {
      let ip4 = '--.--.--.--'
      if (Array.isArray(d.interfaces)) {
        const itf = d.interfaces.find((i) => i.iface === iface && i.operstate === 'up' && !i.internal)
        if (itf && itf.ip4) ip4 = itf.ip4
      }
      this._set('state', this.stateEl, 'ONLINE')
      this._set('iname', this.inameEl, `Interface: ${iface}`)
      this._set('ip4', this.ipv4El, ip4)
      this._set('ping', this.pingEl, '--ms')
    } else {
      this._set('state', this.stateEl, 'OFFLINE')
      this._set('iname', this.inameEl, 'Interface: (offline)')
      this._set('ip4', this.ipv4El, '--.--.--.--')
      this._set('ping', this.pingEl, '--ms')
    }
  }
}
