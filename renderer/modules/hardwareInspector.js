import { mountMod, setText } from '../ui.js'
import { onTelemetry } from '../telemetry.js'

// 硬件信息（原 hardwareInspector.class.js 简化）：制造商 / 型号 / 机箱。改为订阅遥测。
export class HardwareInspector {
  constructor(parentId) {
    const root = mountMod(parentId, 'mod_hardwareInspector', `
      <div id="mod_hardwareInspector_inner">
        <div><h1>MANUFACTURER</h1><h2 id="mod_hardwareInspector_manufacturer">NONE</h2></div>
        <div><h1>MODEL</h1><h2 id="mod_hardwareInspector_model">NONE</h2></div>
        <div><h1>CHASSIS</h1><h2 id="mod_hardwareInspector_chassis">NONE</h2></div>
      </div>`)
    this.manEl = root.querySelector('#mod_hardwareInspector_manufacturer')
    this.modelEl = root.querySelector('#mod_hardwareInspector_model')
    this.chassisEl = root.querySelector('#mod_hardwareInspector_chassis')

    onTelemetry((d) => this.render(d))
  }

  // 去除型号字符串中的制造商词，仅保留后面两个有意义的词
  _trimDataString(model, manufacturer) {
    const mf = String(manufacturer || '').toLowerCase()
    const words = String(model || '').trim().split(/\s+/).filter(Boolean)
    const filtered = words.filter((w) => w.toLowerCase() !== mf)
    return filtered.slice(0, 2).join(' ') || 'NONE'
  }

  render(d) {
    if (!d) return
    if (d.system) {
      const mf = d.system.manufacturer || 'NONE'
      setText(this.manEl, mf)
      setText(this.modelEl, this._trimDataString(d.system.model, mf))
    }
    if (d.chassis) {
      setText(this.chassisEl, d.chassis.type || 'NONE')
    }
  }
}
