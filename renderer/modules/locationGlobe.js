import { mountMod } from '../ui.js'
import { setOnThemeChange } from '../theme.js'

// 地球视图：2D canvas 复刻 encom-globe 招牌观感（点阵球面 + 卫星环 + 定位针 + 扫描线）。
// 主线程 requestAnimationFrame 驱动，缓存优化避免每帧回流。
export class LocationGlobe {
  constructor(parentId) {
    const root = mountMod(parentId, 'mod_globe', `
      <div id="mod_globe_innercontainer">
        <h1>WORLD VIEW<i>GLOBAL NETWORK MAP</i></h1>
        <h2>ENDPOINT LAT/LON<i class="mod_globe_headerInfo">--.--, --.--</i></h2>
        <canvas id="mod_globe_canvas"></canvas>
        <h3>OFFLINE</h3>
      </div>`)
    this.root = root
    this.headerInfo = root.querySelector('.mod_globe_headerInfo')
    this.stateEl = root.querySelector('#mod_globe_innercontainer > h3')
    this.canvas = root.querySelector('#mod_globe_canvas')
    this.ctx = null
    this.angle = 0
    this.markerPulse = 0
    this.geo = null
    this.online = false
    this.tilt = 0.63
    this.introStart = 0
    this.bootEndTime = 0
    this._themeColor = null
    this._rectCache = null
    this._frameCount = 0
    this._running = false

    this._buildDots()
    this._buildSatellites()
    this._refreshColor()
    setOnThemeChange(() => this._refreshColor())
    window.addEventListener('resize', () => this._onResize())
    this.refreshGeo()
    this.geoTimer = setInterval(() => this.refreshGeo(), 30000)
    // 延迟启动渲染循环，确保容器已布局
    requestAnimationFrame(() => this._startLoop())
  }

  _buildDots() {
    const N = 520
    this.dots = []
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = golden * i
      this.dots.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r })
    }
  }

  _buildSatellites() {
    this.sats = [
      { inc: 0.30, radius: 1.06, speed: 0.6, phase: 0 },
      { inc: -0.25, radius: 1.12, speed: -0.4, phase: 1.5 },
      { inc: 0.15, radius: 1.18, speed: 0.9, phase: 3 }
    ]
  }

  _refreshColor() {
    this._themeColor = window.getComputedStyle(document.body).color || 'rgb(170,207,209)'
  }

  _onResize() {
    const rect = this.canvas.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return
    this._rectCache = rect
    if (this.canvas.width !== Math.round(rect.width * 2) || this.canvas.height !== Math.round(rect.height * 2)) {
      this.canvas.width = Math.round(rect.width * 2)
      this.canvas.height = Math.round(rect.height * 2)
      this.ctx = this.canvas.getContext('2d')
      if (this.ctx) this.ctx.setTransform(2, 0, 0, 2, 0, 0)
    }
  }

  _startLoop() {
    if (this._running) return
    this._running = true
    this._onResize()
    this._loop = () => {
      if (!this._running) return
      this._render()
      requestAnimationFrame(this._loop)
    }
    requestAnimationFrame(this._loop)
  }

  _render() {
    this._frameCount++
    // 每 60 帧检查尺寸
    if (this._frameCount % 60 === 0) this._onResize()

    const ctx = this.ctx
    if (!ctx) { this._onResize(); return }
    if (!this._rectCache || !this._rectCache.width) return

    const w = this._rectCache.width
    const h = this._rectCache.height
    const cx = w / 2
    const cy = h / 2
    const R = Math.min(w, h) * 0.44
    if (R < 5) return

    // 入场动画
    const INTRO_MS = 2000
    const INTRO_DELAY_MS = 1500
    if (!this.introStart) {
      if (!document.body.classList.contains('booting')) {
        if (!this.bootEndTime) this.bootEndTime = performance.now()
        if (performance.now() - this.bootEndTime >= INTRO_DELAY_MS) this.introStart = performance.now()
      }
    }
    const draw = this.introStart ? Math.min(1, (performance.now() - this.introStart) / INTRO_MS) : 0
    const sweepY = 1 - draw * 2.4
    const eOut = (t) => 1 - (1 - t) ** 3

    const rgb = (this._themeColor || 'rgb(170,207,209)').match(/\d+/g) || [170, 207, 209]
    const bc = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},`

    ctx.clearRect(0, 0, w, h)

    // 1. 光晕
    const glowPulse = 0.85 + 0.15 * Math.sin(this.markerPulse * 0.25)
    const grad = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R)
    grad.addColorStop(0, `${bc}${(0.03 * draw * glowPulse).toFixed(3)})`)
    grad.addColorStop(1, `${bc}${(0.10 * draw).toFixed(3)})`)
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()

    // 2. 点阵
    for (const d of this.dots) {
      const reveal = Math.max(0, Math.min(1, (d.y - sweepY) / 0.35))
      if (reveal <= 0) continue
      const p = this._project(d, this.angle, this.tilt, cx, cy, R)
      const depth = (p.z + 1) / 2
      const alpha = (0.08 + depth * 0.5) * reveal
      const size = (0.6 + depth * 1.1) * eOut(reveal)
      ctx.fillStyle = `${bc}${alpha.toFixed(3)})`
      ctx.beginPath(); ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2); ctx.fill()
    }

    // 2.5 入场扫掠
    if (draw < 1) {
      const sy = cy - sweepY * R, bandH = R * 0.55
      const bg = ctx.createLinearGradient(0, sy - bandH, 0, sy + bandH)
      bg.addColorStop(0, `${bc}0)`)
      bg.addColorStop(0.5, `${bc}${(0.16 * (1 - draw * 0.4)).toFixed(3)})`)
      bg.addColorStop(1, `${bc}0)`)
      ctx.fillStyle = bg; ctx.fillRect(cx - R * 1.3, sy - bandH, R * 2.6, bandH * 2)
      ctx.strokeStyle = `${bc}${(0.45 * (1 - draw)).toFixed(3)})`
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(cx - R * 1.25, sy); ctx.lineTo(cx + R * 1.25, sy); ctx.stroke()
    }

    // 3. rim
    ctx.strokeStyle = `${bc}${(0.35 * draw).toFixed(3)})`
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()

    // 4. 卫星环
    for (const s of this.sats) {
      const a = this.angle * s.speed + s.phase
      const ct = Math.cos(s.inc), st = Math.sin(s.inc)
      ctx.strokeStyle = `${bc}${(0.40 * draw).toFixed(3)})`
      ctx.lineWidth = 1; ctx.beginPath()
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2
        let vx = Math.cos(t), vy = 0, vz = Math.sin(t)
        const vy2 = vy * ct - vz * st, vz2 = vy * st + vz * ct; vy = vy2; vz = vz2
        const cs2 = Math.cos(a), sn2 = Math.sin(a)
        const sx = cx + (vx * cs2 + vz * sn2) * R * s.radius
        const sy2 = cy - vy * R * s.radius
        if (i === 0) ctx.moveTo(sx, sy2); else ctx.lineTo(sx, sy2)
      }
      ctx.stroke()
      // 卫星亮点
      const satT = a
      let vx2 = Math.cos(satT), vy2 = 0, vz2 = Math.sin(satT)
      const vy3 = vy2 * ct - vz2 * st, vz3 = vy2 * st + vz2 * ct
      const cs3 = Math.cos(a), sn3 = Math.sin(a)
      const ssx = cx + (vx2 * cs3 + vz2 * sn3) * R * s.radius
      const ssy = cy - vy3 * R * s.radius
      ctx.fillStyle = `${bc}${(0.18 * draw).toFixed(3)})`
      ctx.beginPath(); ctx.arc(ssx, ssy, 4.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = `${bc}${(0.95 * draw).toFixed(3)})`
      ctx.beginPath(); ctx.arc(ssx, ssy, 2.4, 0, Math.PI * 2); ctx.fill()
    }

    // 5. 定位针
    if (this.geo && draw > 0.85) this._drawMarker(ctx, cx, cy, R, bc)
    // 6. 扫描线
    if (!this.online) this._drawScanLine(ctx, cx, cy, R, bc)

    this.angle += 0.0035
    this.markerPulse += 0.08
  }

  _project(v, spin, tilt, cx, cy, R) {
    const cs = Math.cos(spin), sn = Math.sin(spin)
    const x = v.x * cs + v.z * sn, y = v.y, z = -v.x * sn + v.z * cs
    const ct = Math.cos(tilt), st = Math.sin(tilt)
    const y2 = y * ct - z * st, z2 = y * st + z * ct
    return { sx: cx + x * R, sy: cy - y2 * R, z: z2 }
  }

  _latLonToVec(latDeg, lonDeg) {
    const lat = (latDeg * Math.PI) / 180, lon = (lonDeg * Math.PI) / 180
    return { x: Math.cos(lat) * Math.cos(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.sin(lon) }
  }

  _drawMarker(c, cx, cy, R, bc) {
    const v = this._latLonToVec(this.geo.lat, this.geo.lon)
    const p = this._project(v, this.angle, this.tilt, cx, cy, R)
    if (p.z < -0.05) return
    const depth = Math.max(0.4, (p.z + 1) / 2)
    const pulse = 1 + Math.sin(this.markerPulse) * 0.4
    c.strokeStyle = `rgba(255,92,92,${(0.4 * depth * (1 - Math.sin(this.markerPulse) * 0.3)).toFixed(3)})`
    c.lineWidth = 1
    c.beginPath(); c.arc(p.sx, p.sy, 7 * pulse, 0, Math.PI * 2); c.stroke()
    c.strokeStyle = `rgba(255,92,92,${(0.25 * depth).toFixed(3)})`
    c.beginPath(); c.arc(p.sx, p.sy, 10 * pulse, 0, Math.PI * 2); c.stroke()
    c.fillStyle = '#ff5c5c'
    c.beginPath(); c.arc(p.sx, p.sy, 2.8, 0, Math.PI * 2); c.fill()
  }

  _drawScanLine(c, cx, cy, R, bc) {
    const t = Date.now() / 1800
    const yP = cy + Math.sin(t) * R * 0.75
    c.strokeStyle = `${bc.replace('rgb', 'rgba').replace(')', ',0.22)')}`
    c.lineWidth = 1
    c.beginPath(); c.moveTo(cx - R, yP); c.lineTo(cx + R, yP); c.stroke()
  }

  async refreshGeo() {
    if (!window.eDEX || !window.eDEX.geoipLookup) { this._setOffline(); return }
    try {
      const r = await window.eDEX.geoipLookup()
      if (r.offline) { this._setOffline() }
      else {
        this.online = true
        this.root.setAttribute('class', '')
        this.stateEl.textContent = 'ONLINE' + (r.ip ? '  ' + r.ip : '')
        const geo = (typeof r.lat === 'number' && typeof r.lon === 'number') ? { lat: r.lat, lon: r.lon } : null
        this.headerInfo.textContent = geo ? `${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)}` : 'UNKNOWN'
        this.geo = geo
      }
    } catch (_) { this._setOffline() }
  }

  _setOffline() {
    this.online = false
    this.geo = null
    this.root.setAttribute('class', 'offline')
    this.stateEl.textContent = 'OFFLINE'
    this.headerInfo.textContent = '(OFFLINE)'
  }
}
