import { mountMod, themeRGB } from '../ui.js'
import { getCurrentTheme, setOnThemeChange } from '../theme.js'
import { audiofx } from './audiofx.js'

// encom-globe: Three.js 地球视图（带陆地/海域轮廓 + 卫星星座 + 连接线）
// 由 index.html 加载 vendor/encom-globe.js 注入 window.ENCOM.Globe

let globes = []

export class LocationGlobe {
  constructor(parentId) {
    const root = mountMod(parentId, 'mod_globe', `
      <div id="mod_globe_innercontainer">
        <h1>WORLD VIEW<i>GLOBAL NETWORK MAP</i></h1>
        <h2>ENDPOINT LAT/LON<i class="mod_globe_headerInfo">--.--, --.--</i></h2>
        <div id="mod_globe_canvas_placeholder"></div>
        <h3>OFFLINE</h3>
      </div>`)
    this.root = root
    this.headerInfo = root.querySelector('.mod_globe_headerInfo')
    this.stateEl = root.querySelector('#mod_globe_innercontainer > h3')
    this.placeholder = root.querySelector('#mod_globe_canvas_placeholder')
    this.container = root.querySelector('#mod_globe_innercontainer')
    this.globe = null
    this._geoPin = null
    this._geoMarker = null
    this._conns = []
    this._geo = null
    this._online = false
    this._running = false
    this._fullscreen = false
    this._overlay = null
    this._fsIntervals = []
    this._fsConnMarkers = []
    this._connHistory = []
    this._cubeRAF = null
    this._barChartTimer = null
    this._cubeStart = 0

    // 等布局完成 + 入场动画后初始化
    setTimeout(() => this._init(), 2000)
    setTimeout(() => this._startUpdaters(), 4000)

    setOnThemeChange(() => this._recolor())
    window.addEventListener('resize', () => this._resize())
    globes.push(this)
  }

  async _init() {
    if (!window.ENCOM || !window.ENCOM.Globe) {
      console.warn('[globe] ENCOM.Globe not loaded, retrying...')
      setTimeout(() => this._init(), 500)
      return
    }

    const theme = getCurrentTheme()
    const baseColor = (theme && theme.globe && theme.globe.base) || `rgb(170,207,209)`
    const markerColor = (theme && theme.globe && theme.globe.marker) || `rgb(170,207,209)`
    const pinColor = (theme && theme.globe && theme.globe.pin) || `rgb(170,207,209)`
    const satColor = (theme && theme.globe && theme.globe.satellite) || `rgb(170,207,209)`

    // 加载 grid.json（地形瓦片数据）
    let tiles = []
    try {
      const resp = await fetch('./misc/grid.json')
      const data = await resp.json()
      tiles = data.tiles || []
    } catch (e) {
      console.warn('[globe] failed to load grid.json:', e)
    }

    const w = this.placeholder.offsetWidth || 250
    const h = this.placeholder.offsetHeight || 200

    this.globe = new window.ENCOM.Globe(w, h, {
      font: (theme && theme.cssvars && theme.cssvars.font_main) || 'Fira Mono',
      data: [],
      tiles: tiles,
      baseColor: baseColor,
      markerColor: markerColor,
      pinColor: pinColor,
      satelliteColor: satColor,
      scale: 1.1,
      viewAngle: 0.630,
      dayLength: 1000 * 45,
      introLinesDuration: 2000,
      introLinesColor: markerColor,
      maxPins: 300,
      maxMarkers: 100
    })

    // 替换占位 div 为 encom canvas
    this.placeholder.remove()
    this.container.appendChild(this.globe.domElement)

    // 点击地球全屏
    this.globe.domElement.style.cursor = 'pointer'
    this.globe.domElement.addEventListener('click', () => this._toggleFullscreen())

    // 启动动画（音效在动画开始时播放）
    const bgColor = (theme && theme.colors && theme.colors.light_black) || '#05080d'
    audiofx.play('scan')
    this.globe.init(bgColor, () => {
      this._animate()
    })

    // 添加随机卫星星座
    const constellation = []
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        constellation.push({
          lat: 50 * i - 30 + 15 * Math.random(),
          lon: 120 * j - 120 + 30 * i,
          altitude: Math.random() * (1.7 - 1.3) + 1.3
        })
      }
    }
    this.globe.addConstellation(constellation)

    this._running = true
  }

  _toggleFullscreen() {
    if (!this.globe) return
    if (this._fullscreen) this._exitFullscreen()
    else this._enterFullscreen()
  }

  // =====================================================================
  //  全屏模式 — 地球作为全屏背景，面板浮动在上方
  // =====================================================================

  _enterFullscreen() {
    if (!this.globe) return
    this._fullscreen = true
    window.__globeFullscreen = true

    // 计算全屏主题色（一次性），供 canvas 绘制统一使用主页面配色
    const fsTheme = themeRGB()
    this._fsThemeColor = fsTheme
    this._fsThemeColorDim = fsTheme.replace('rgb(', 'rgba(').replace(')', ', 0.35)')

    // 监听 main.js 转发的 ESC 事件
    this._fsEscCustom = () => this._exitFullscreen()
    window.addEventListener('globe-exit-fullscreen', this._fsEscCustom)

    // 保存地理状态
    const savedGeo = this._geo
    const savedOnline = this._online

    // 摧毁当前 globe
    this._running = false
    this._geoPin = null
    this._geoMarker = null
    const oldCanvas = this.root.querySelector('canvas')
    if (oldCanvas) oldCanvas.remove()
    this.globe = null

    // 重置柱状图历史
    this._connHistory = []

    // ---- 创建全屏 overlay ----
    const overlay = document.createElement('div')
    overlay.id = 'globe-fullscreen-overlay'
    overlay.innerHTML = `
      <style>
        #globe-fullscreen-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: #000000;
          font-family: 'Fira Mono', monospace;
          color: rgb(var(--color_r), var(--color_g), var(--color_b));
          overflow: hidden;
        }
        @keyframes globe-fadeout { from { opacity: 1 } to { opacity: 0 } }
        #globe-fullscreen-overlay.fadeout {
          animation: globe-fadeout 0.4s ease forwards;
        }

        /* 全屏地球 canvas — 收进左右面板之间的中央竖条区域 */
        #globe-fs-canvas {
          position: fixed; top: 0; bottom: 0; left: 10vw; right: 21vw; z-index: 1;
          overflow: hidden;
        }
        #globe-fs-canvas canvas {
          display: block;
        }

        /* ============== 面板定位（仅定位，背景/边框/字体由主页面 .panel 提供） ============== */
        .globe-fs-panel-left,
        .globe-fs-panel-right {
          position: fixed;
          z-index: 2;
          max-height: 75vh;
          overflow-y: auto;
          background: var(--color_light_black);
        }
        .globe-fs-panel-left::-webkit-scrollbar,
        .globe-fs-panel-right::-webkit-scrollbar { width: 0.3vw; }
        .globe-fs-panel-left::-webkit-scrollbar-track,
        .globe-fs-panel-right::-webkit-scrollbar-track { background: transparent; }
        .globe-fs-panel-left::-webkit-scrollbar-thumb,
        .globe-fs-panel-right::-webkit-scrollbar-thumb { background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.2); }

        /* 左侧面板 — 窄，精确数据 */
        .globe-fs-panel-left {
          left: 0.6vw; top: 50%; transform: translateY(-50%);
          width: 9vw; min-width: 100px;
        }
        /* 右侧面板 — 宽，详细统计 */
        .globe-fs-panel-right {
          right: 0.6vw; top: 50%; transform: translateY(-50%);
          width: 20vw; min-width: 200px;
        }

        /* 面板标题/标签改为主页面 .title / .kv 风格，此处不再定义 TRON 装饰类 */

        /* 数据行改为主页面 .kv 风格 */

        /* 左侧栏 .kv 覆盖：窄栏中标签与值改为上下换行（标签在上、值在下） */
        .globe-fs-panel-left .kv {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.35vh;
          padding: 0.5vh 0;
          border-bottom: 0.05vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.15);
        }
        .globe-fs-panel-left .kv:last-child {
          border-bottom: none;
        }
        .globe-fs-panel-left .kv span {
          font-size: 0.85vh;
          opacity: 0.55;
          text-transform: uppercase;
          letter-spacing: 0.08vh;
        }
        .globe-fs-panel-left .kv b {
          font-size: 1.45vh;
          font-weight: 500;
          opacity: 0.95;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }

        /* ============== 底部区域 ============== */
        .fs-bottom {
          margin-top: 1.2vh;
          padding-top: 0.8vh;
          border-top: 0.092vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.15);
        }
        .fs-bottom-row {
          font-size: 0.85vh;
          opacity: 0.45;
          margin-bottom: 0.6vh;
          letter-spacing: 0.08vw;
        }
        .fs-logo {
          display: flex; align-items: center; gap: 0.4vw;
          font-size: 1.1vh;
          font-weight: bold;
          color: rgb(255, 255, 255);
          letter-spacing: 0.12vw;
        }
        .fs-logo-icon {
          display: inline-block;
          width: 1.1vw; min-width: 14px; aspect-ratio: 1;
          background: rgb(var(--color_r), var(--color_g), var(--color_b));
          clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
        }
        .fs-logo-text {
          color: rgb(var(--color_r), var(--color_g), var(--color_b));
        }

        /* ============== 右侧 — 标题与立方体 ============== */
        .fs-header-row {
          display: flex; justify-content: flex-end; align-items: center;
          margin-bottom: 0.6vh;
        }
        .fs-cube {
          width: 9vw; max-width: 140px; min-width: 100px;
          height: 6vh; min-height: 60px;
          flex-shrink: 0;
          background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.04);
          border: 0.092vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.25);
          border-radius: 0.2vh;
        }

        /* ============== 区段标题 ============== */
        .fs-section { margin-top: 1.2vh; }
        .fs-section:first-of-type { margin-top: 1.2vh; }
        .fs-section-title {
          font-size: 0.9vh;
          color: rgba(var(--color_r), var(--color_g), var(--color_b), 0.7);
          text-transform: uppercase;
          letter-spacing: 0.18vw;
          margin: 0 0 0.6vh 0;
          padding-bottom: 0.3vh;
          border-bottom: 0.046vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.15);
        }

        /* 统计行/迷你条改为主页面 .kv / .bar 风格 */

        /* ============== 性能展示 ============== */
        .fs-perf-grid {
          display: flex; flex-direction: column;
          align-items: flex-start;
          margin: 0.6vh 0 0.8vh 0;
        }
        .fs-perf-label {
          font-size: 1.0vh;
          color: rgb(255, 255, 255);
          font-weight: bold;
          letter-spacing: 0.12vw;
          text-transform: uppercase;
        }
        .fs-perf-sub {
          font-size: 0.8vh;
          opacity: 0.5;
          margin-top: 0.2vh;
          letter-spacing: 0.08vw;
        }
        .fs-perf-value {
          font-size: 3vh;
          color: rgb(var(--color_r), var(--color_g), var(--color_b));
          font-weight: bold;
          line-height: 1.1;
          margin-top: 0.3vh;
          letter-spacing: 0.1vw;
          text-shadow: 0 0 0.6vh rgba(var(--color_r), var(--color_g), var(--color_b), 0.3);
        }
        .fs-perf-unit {
          font-size: 1.0vh;
          opacity: 0.5;
          letter-spacing: 0.12vw;
          text-transform: uppercase;
        }
        .fs-bar-chart {
          display: block;
          width: 100%;
          height: 8vh;
          min-height: 70px;
          margin-top: 0.6vh;
          background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.02);
          border-top: 0.046vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.15);
          border-bottom: 0.046vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.15);
        }

        /* 底部退出提示 */
        .globe-fs-hint {
          position: fixed; bottom: 2vh; left: 50%; transform: translateX(-50%);
          font-size: 1.0vh; opacity: 0.25;
          font-family: 'Fira Mono', monospace; letter-spacing: 0.15vw;
          pointer-events: none; z-index: 3;
        }
      </style>

      <!-- 全屏地球 canvas 容器 -->
      <div id="globe-fs-canvas"></div>

      <!-- ============== 左侧面板 ============== -->
      <div class="panel augmented globe-fs-panel-left" id="globe-fs-left" augmented-ui="bl-clip tr-clip exe">
        <h3 class="title"><p>NETWORK STATUS</p><p>GLOBAL UPLINK</p></h3>
        <div class="panel-body">
          <div class="kv"><span>YOUR IP</span><b id="globe-fs-ip">--.--.--.--</b></div>
          <div class="kv"><span>LOCATION</span><b id="globe-fs-location">--.--, --.--</b></div>
          <div class="kv"><span>PING</span><b id="globe-fs-ping">--ms</b></div>
          <div class="kv"><span>CONNECTIONS</span><b id="globe-fs-connections">0</b></div>
          <div class="kv"><span>UP</span><b id="globe-fs-up">-- Mbps</b></div>
          <div class="kv"><span>DOWN</span><b id="globe-fs-down">-- Mbps</b></div>
          <div class="fs-bottom">
            <div class="fs-bottom-row" id="globe-fs-bottom-loc">Location: Not Specified</div>
            <div class="fs-logo">
              <span class="fs-logo-icon"></span>
              <span class="fs-logo-text">eDEX-UI-Plus</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ============== 右侧面板 ============== -->
      <div class="panel augmented globe-fs-panel-right" id="globe-fs-right" augmented-ui="bl-clip tr-clip exe">
        <h3 class="title"><p>LIVE DATA FEED</p></h3>
        <div class="panel-body">
          <div class="fs-section">
            <h2 class="fs-section-title">PROTOCOLS</h2>
            <div class="kv"><span>TCP</span><b id="globe-fs-tcp">0</b></div>
            <div class="bar"><i id="globe-fs-tcp-bar" style="width:0%"></i></div>
            <div class="kv"><span>UDP</span><b id="globe-fs-udp">0</b></div>
            <div class="bar"><i id="globe-fs-udp-bar" style="width:0%"></i></div>
            <div class="kv"><span>ICMP</span><b id="globe-fs-icmp">0</b></div>
            <div class="bar"><i id="globe-fs-icmp-bar" style="width:0%"></i></div>
          </div>

          <div class="fs-section">
            <h2 class="fs-section-title">CONN STATES</h2>
            <div class="kv"><span>ESTABLISHED</span><b id="globe-fs-established">0</b></div>
            <div class="bar"><i id="globe-fs-est-bar" style="width:0%"></i></div>
            <div class="kv"><span>TIME_WAIT</span><b id="globe-fs-timewait">0</b></div>
            <div class="bar"><i id="globe-fs-tw-bar" style="width:0%"></i></div>
            <div class="kv"><span>CLOSE_WAIT</span><b id="globe-fs-closewait">0</b></div>
            <div class="bar"><i id="globe-fs-cw-bar" style="width:0%"></i></div>
            <div class="kv"><span>LISTEN</span><b id="globe-fs-listen">0</b></div>
            <div class="bar"><i id="globe-fs-listen-bar" style="width:0%"></i></div>
          </div>

          <div class="fs-section">
            <h2 class="fs-section-title">PORTS</h2>
            <div class="kv"><span>443 (HTTPS)</span><b id="globe-fs-port443">0</b></div>
            <div class="bar"><i id="globe-fs-p443-bar" style="width:0%"></i></div>
            <div class="kv"><span>80 (HTTP)</span><b id="globe-fs-port80">0</b></div>
            <div class="bar"><i id="globe-fs-p80-bar" style="width:0%"></i></div>
            <div class="kv"><span>22 (SSH)</span><b id="globe-fs-port22">0</b></div>
            <div class="bar"><i id="globe-fs-p22-bar" style="width:0%"></i></div>
            <div class="kv"><span>53 (DNS)</span><b id="globe-fs-port53">0</b></div>
            <div class="bar"><i id="globe-fs-p53-bar" style="width:0%"></i></div>
            <div class="kv"><span>Other</span><b id="globe-fs-portother">0</b></div>
            <div class="bar"><i id="globe-fs-pother-bar" style="width:0%"></i></div>
          </div>
        </div>
      </div>

      <span class="globe-fs-hint">ESC = EXIT</span>
    `
    document.body.appendChild(overlay)
    this._overlay = overlay

    // 引用面板 DOM
    this._fsLeftEl = overlay.querySelector('#globe-fs-left')
    this._fsRightEl = overlay.querySelector('#globe-fs-right')

    // 在全屏容器重建 globe
    this.container = overlay.querySelector('#globe-fs-canvas')
    this.placeholder = this.container

    this._initFullscreen()

    // 启动全屏数据更新
    this._startFullscreenUpdaters()

    // 3D 立方体动画随装饰区移除而停用（#fs-cube 已不存在）
    // 保留 _startCubeAnimation() / _stopCubeAnimation() 方法，仅不再主动启动

    // ESC 退出
    this._fsEscHandler = (e) => {
      if (e.key === 'Escape') this._exitFullscreen()
    }
    window.addEventListener('keydown', this._fsEscHandler)
  }

  async _initFullscreen() {
    // 重建 globe — 尺寸跟随中央容器(10vw~79vw 区域),不再溢出到面板下
    const theme = getCurrentTheme()
    const baseColor = (theme && theme.globe && theme.globe.base) || `rgb(170,207,209)`
    const markerColor = (theme && theme.globe && theme.globe.marker) || `rgb(170,207,209)`
    const pinColor = (theme && theme.globe && theme.globe.pin) || `rgb(170,207,209)`
    const satColor = (theme && theme.globe && theme.globe.satellite) || `rgb(170,207,209)`

    let tiles = []
    try {
      const resp = await fetch('./misc/grid.json')
      const data = await resp.json()
      tiles = data.tiles || []
    } catch (_) {}

    const w = (this.container && this.container.clientWidth) || window.innerWidth
    const h = (this.container && this.container.clientHeight) || window.innerHeight

    this.globe = new window.ENCOM.Globe(w, h, {
      font: (theme && theme.cssvars && theme.cssvars.font_main) || 'Fira Mono',
      data: [], tiles,
      baseColor: baseColor, markerColor: markerColor,
      pinColor: pinColor, satelliteColor: satColor,
      scale: 1.1, viewAngle: 0.630, dayLength: 1000 * 45,
      introLinesDuration: 2000, introLinesColor: markerColor,
      maxPins: 300, maxMarkers: 100
    })

    this.placeholder.appendChild(this.globe.domElement)

    const bgColor = '#000000'
    audiofx.play('scan')
    this.globe.init(bgColor, () => {
      this._animate()
    })

    // 卫星星座
    const constellation = []
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 3; j++)
        constellation.push({
          lat: 50 * i - 30 + 15 * Math.random(),
          lon: 120 * j - 120 + 30 * i,
          altitude: Math.random() * (1.7 - 1.3) + 1.3
        })
    this.globe.addConstellation(constellation)

    this._running = true

    // 恢复定位针（红色）
    if (this._geo && this.globe) {
      this._geoMarker = this.globe.addMarker(this._geo.lat, this._geo.lon, '', false, 1.2, 'rgb(230,60,60)')
      const origPinColor = this.globe.pinColor
      this.globe.pinColor = 'rgb(230,60,60)'
      this._geoPin = this.globe.addPin(this._geo.lat, this._geo.lon, '', 1.2)
      this.globe.pinColor = origPinColor
    }

    // 初始渲染面板数据
    this._updateFullscreenLeftPanel()
    this._updateFullscreenRightPanel()

    // 初始化柱状图（用零数据预填 12 个）
    if (this._connHistory.length === 0) {
      this._connHistory = new Array(12).fill(0)
    }
    this._drawBarChart()
  }

  _exitFullscreen() {
    if (!this._fullscreen) return

    // 停止全屏 intervals
    this._stopFullscreenUpdaters()

    // 停止立方体动画
    this._stopCubeAnimation()

    // 清除弧线
    this._clearArcs()

    this._fullscreen = false
    window.__globeFullscreen = false
    window.removeEventListener('globe-exit-fullscreen', this._fsEscCustom)

    window.removeEventListener('keydown', this._fsEscHandler)

    // 淡出动画
    const overlay = this._overlay
    if (overlay) overlay.classList.add('fadeout')

    // 等动画完成再清理
    setTimeout(() => {
      // 摧毁全屏 globe
      this._running = false
      this._geoPin = null
      this._geoMarker = null
      this._fsConnMarkers = []
      if (this.globe) {
        const c = this.globe.domElement
        if (c) c.remove()
        this.globe = null
      }

      // 移除遮罩
      if (overlay) overlay.remove()
      this._overlay = null

      // 恢复侧栏容器引用
      this.container = this.root.querySelector('#mod_globe_innercontainer')

      // 重建侧栏 globe（触发开场动画 + 音效）
      const placeholder = document.createElement('div')
      placeholder.id = 'mod_globe_canvas_placeholder'
      placeholder.style.width = '109%'
      placeholder.style.height = '0px'
      placeholder.style.paddingBottom = '100%'
      this.container.appendChild(placeholder)
      this.placeholder = placeholder
      this._init()

      // 恢复 GeoIP 显示
      if (this._geo) this.headerInfo.textContent = `${this._geo.lat}, ${this._geo.lon}`
    }, 450) // 400ms 动画 + 50ms 余量
  }

  _animate() {
    if (!this._running || !this.globe) return
    this.globe.tick()

    // 全屏模式下每帧刷新弧线（弧线 canvas 跟随相机旋转）
    if (this._fullscreen) {
      this._renderArcs()
    }

    setTimeout(() => {
      try {
        requestAnimationFrame(() => this._animate())
      } catch (_) {}
    }, 1000 / 30)
  }

  _resize() {
    if (!this.globe) return
    if (this._fullscreen) {
      // 全屏下尺寸跟随中央容器,避免地球溢出到面板下
      const w = (this.container && this.container.clientWidth) || window.innerWidth
      const h = (this.container && this.container.clientHeight) || window.innerHeight
      if (w > 0 && h > 0) {
        this.globe.camera.aspect = w / h
        this.globe.camera.updateProjectionMatrix()
        this.globe.renderer.setSize(w, h)
      }
      return
    }
    // 侧栏 resize
    const canvas = this.root.querySelector('canvas')
    if (!canvas) return
    this.globe.camera.aspect = canvas.offsetWidth / canvas.offsetHeight
    this.globe.camera.updateProjectionMatrix()
    this.globe.renderer.setSize(canvas.offsetWidth, canvas.offsetHeight)
  }

  _recolor() {
    if (this.globe) {
      this._fullscreen = false
      this._stopCubeAnimation()
      if (this._overlay) { this._overlay.remove(); this._overlay = null }
      this._running = false
      const canvas = this.root.querySelector('canvas')
      if (canvas) canvas.remove()
      this.globe = null
      const placeholder = document.createElement('div')
      placeholder.id = 'mod_globe_canvas_placeholder'
      this.container.appendChild(placeholder)
      this.placeholder = placeholder
      this._init()
    }
  }

  // =====================================================================
  //  侧栏数据更新（不变）
  // =====================================================================

  _startUpdaters() {
    this._updateLoc()
    setInterval(() => this._updateLoc(), 1000)
    setInterval(() => this._updateConns(), 3000)
  }

  async _updateLoc() {
    if (!window.eDEX || !window.eDEX.geoipLookup) return
    try {
      const r = await window.eDEX.geoipLookup()
      if (r.offline) { this._setOffline(); return }
      this._online = true
      this.root.setAttribute('class', '')
      this.stateEl.textContent = 'ONLINE' + (r.ip ? '  ' + r.ip : '')

      if (typeof r.lat !== 'number' || typeof r.lon !== 'number') {
        this.headerInfo.textContent = 'UNKNOWN'
        return
      }
      const lat = Math.round(r.lat * 10000) / 10000
      const lon = Math.round(r.lon * 10000) / 10000

      if (this._geo && this._geo.lat === lat && this._geo.lon === lon) return
      this._geo = { lat, lon, ip: r.ip || '--.--.--.--' }
      this.headerInfo.textContent = `${lat}, ${lon}`

      // 同步更新全屏面板
      if (this._fullscreen) {
        this._updateFullscreenLeftPanel()
      }

      if (this.globe) {
        if (this._geoPin) { try { this._geoPin.remove() } catch (_) {} }
        if (this._geoMarker) { try { this._geoMarker.remove() } catch (_) {} }
        this._geoMarker = this.globe.addMarker(lat, lon, '', false, 1.2, 'rgb(230,60,60)')
        const origPinColor = this.globe.pinColor
        this.globe.pinColor = 'rgb(230,60,60)'
        this._geoPin = this.globe.addPin(lat, lon, '', 1.2)
        this.globe.pinColor = origPinColor
      }
    } catch (_) { this._setOffline() }
  }

  async _updateConns() {
    if (!this._online) return
    try {
      const conns = await window.eDEX.si('networkConnections')
      this._conns = (conns || []).filter(c =>
        c.state === 'ESTABLISHED' && c.peeraddress &&
        c.peeraddress !== '0.0.0.0' && c.peeraddress !== '127.0.0.1'
      )
    } catch (_) {}
  }

  _setOffline() {
    this._online = false; this._geo = null
    this.root.setAttribute('class', 'offline')
    this.stateEl.textContent = 'OFFLINE'
    this.headerInfo.textContent = '(OFFLINE)'
    if (this._geoPin) { try { this._geoPin.remove() } catch (_) {} this._geoPin = null }
    if (this._geoMarker) { try { this._geoMarker.remove() } catch (_) {} this._geoMarker = null }
  }

  // =====================================================================
  //  全屏面板数据更新
  // =====================================================================

  _startFullscreenUpdaters() {
    this._stopFullscreenUpdaters()

    // 左侧面板每 3 秒刷新
    const leftInterval = setInterval(() => {
      if (!this._fullscreen) return
      this._updateFullscreenLeftPanel()
    }, 3000)
    this._fsIntervals.push(leftInterval)

    // 右侧面板每 3 秒刷新
    const rightInterval = setInterval(() => {
      if (!this._fullscreen) return
      this._updateFullscreenRightPanel()
    }, 3000)
    this._fsIntervals.push(rightInterval)

    // 连接数据获取每 3 秒
    const connInterval = setInterval(() => {
      if (!this._fullscreen) return
      this._updateConns()
    }, 3000)
    this._fsIntervals.push(connInterval)

    // 弧线更新每 5 秒
    const arcInterval = setInterval(() => {
      if (!this._fullscreen || !this._geo || !this.globe) return
      this._drawArcs()
    }, 5000)
    this._fsIntervals.push(arcInterval)
  }

  _stopFullscreenUpdaters() {
    for (const id of this._fsIntervals) {
      clearInterval(id)
    }
    this._fsIntervals = []
  }

  _updateFullscreenLeftPanel() {
    if (!this._fullscreen) return
    const overlay = this._overlay
    if (!overlay) return

    const ipEl = overlay.querySelector('#globe-fs-ip')
    const locEl = overlay.querySelector('#globe-fs-location')
    const pingEl = overlay.querySelector('#globe-fs-ping')
    const connEl = overlay.querySelector('#globe-fs-connections')
    const upEl = overlay.querySelector('#globe-fs-up')
    const downEl = overlay.querySelector('#globe-fs-down')
    const bottomLocEl = overlay.querySelector('#globe-fs-bottom-loc')

    if (!ipEl) return

    // IP & Location
    if (this._geo) {
      ipEl.textContent = this._geo.ip || '--.--.--.--'
      locEl.textContent = `${this._geo.lat}, ${this._geo.lon}`
      if (bottomLocEl) {
        bottomLocEl.textContent = `Location: ${this._geo.lat}, ${this._geo.lon}`
      }
    } else {
      ipEl.textContent = '--.--.--.--'
      locEl.textContent = '--.--, --.--'
      if (bottomLocEl) bottomLocEl.textContent = 'Location: Not Specified'
    }

    // Ping — 使用 geoipLookup 的往返作为近似 ping
    if (window.eDEX && window.eDEX.geoipLookup) {
      const pingStart = Date.now()
      window.eDEX.geoipLookup().then((r) => {
        if (!r.offline) {
          const pingMs = Date.now() - pingStart
          pingEl.textContent = pingMs + 'ms'
        } else {
          pingEl.textContent = '--ms'
        }
      }).catch(() => {
        pingEl.textContent = '--ms'
      })
    }

    // Connections count
    const activeCount = this._conns ? this._conns.length : 0
    connEl.textContent = activeCount

    // UP / DOWN — 从 networkStats 获取
    this._getNetworkStats().then((stats) => {
      if (stats) {
        upEl.textContent = stats.up
        downEl.textContent = stats.down
      }
    }).catch(() => {
      upEl.textContent = '-- Mbps'
      downEl.textContent = '-- Mbps'
    })
  }

  async _getNetworkStats() {
    try {
      const stats = await window.eDEX.si('networkStats')
      if (!stats || !Array.isArray(stats)) return null
      // 找第一个非虚拟活动网卡
      const iface = stats.find((s) => s && !s.internal && s.operstate === 'up')
      if (!iface) return null
      const txMbps = ((iface.tx_sec || 0) * 8 / 1000000).toFixed(1)
      const rxMbps = ((iface.rx_sec || 0) * 8 / 1000000).toFixed(1)
      return { up: txMbps + ' Mbps', down: rxMbps + ' Mbps' }
    } catch (_) {
      return null
    }
  }

  _updateFullscreenRightPanel() {
    if (!this._fullscreen) return
    const overlay = this._overlay
    if (!overlay) return

    // 获取所有连接（包括非 ESTABLISHED）
    window.eDEX.si('networkConnections').then((conns) => {
      const all = conns || []

      // 各元素
      const tcpEl = overlay.querySelector('#globe-fs-tcp')
      const udpEl = overlay.querySelector('#globe-fs-udp')
      const icmpEl = overlay.querySelector('#globe-fs-icmp')
      const estEl = overlay.querySelector('#globe-fs-established')
      const twEl = overlay.querySelector('#globe-fs-timewait')
      const cwEl = overlay.querySelector('#globe-fs-closewait')
      const listenEl = overlay.querySelector('#globe-fs-listen')
      const p443El = overlay.querySelector('#globe-fs-port443')
      const p80El = overlay.querySelector('#globe-fs-port80')
      const p22El = overlay.querySelector('#globe-fs-port22')
      const p53El = overlay.querySelector('#globe-fs-port53')
      const pOtherEl = overlay.querySelector('#globe-fs-portother')

      // Protocols
      let tcp = 0, udp = 0, icmp = 0
      for (const c of all) {
        const p = (c.protocol || '').toUpperCase()
        if (p === 'TCP') tcp++
        else if (p === 'UDP') udp++
        else icmp++
      }
      const protoMax = Math.max(tcp, udp, icmp, 1)
      if (tcpEl) tcpEl.textContent = tcp
      const tcpBar = overlay.querySelector('#globe-fs-tcp-bar')
      if (tcpBar) tcpBar.style.width = (tcp / protoMax * 100) + '%'
      if (udpEl) udpEl.textContent = udp
      const udpBar = overlay.querySelector('#globe-fs-udp-bar')
      if (udpBar) udpBar.style.width = (udp / protoMax * 100) + '%'
      if (icmpEl) icmpEl.textContent = icmp
      const icmpBar = overlay.querySelector('#globe-fs-icmp-bar')
      if (icmpBar) icmpBar.style.width = (icmp / protoMax * 100) + '%'

      // Connection states
      let est = 0, tw = 0, cw = 0, listen = 0
      for (const c of all) {
        const s = (c.state || '').toUpperCase()
        if (s === 'ESTABLISHED') est++
        else if (s === 'TIME_WAIT') tw++
        else if (s === 'CLOSE_WAIT') cw++
        else if (s === 'LISTEN') listen++
      }
      const stateMax = Math.max(est, tw, cw, listen, 1)
      if (estEl) estEl.textContent = est
      const estBar = overlay.querySelector('#globe-fs-est-bar')
      if (estBar) estBar.style.width = (est / stateMax * 100) + '%'
      if (twEl) twEl.textContent = tw
      const twBar = overlay.querySelector('#globe-fs-tw-bar')
      if (twBar) twBar.style.width = (tw / stateMax * 100) + '%'
      if (cwEl) cwEl.textContent = cw
      const cwBar = overlay.querySelector('#globe-fs-cw-bar')
      if (cwBar) cwBar.style.width = (cw / stateMax * 100) + '%'
      if (listenEl) listenEl.textContent = listen
      const listenBar = overlay.querySelector('#globe-fs-listen-bar')
      if (listenBar) listenBar.style.width = (listen / stateMax * 100) + '%'

      // Ports
      let p443 = 0, p80 = 0, p22 = 0, p53 = 0, pOther = 0
      for (const c of all) {
        const port = parseInt(c.peerport, 10)
        if (port === 443) p443++
        else if (port === 80) p80++
        else if (port === 22) p22++
        else if (port === 53) p53++
        else if (port > 0) pOther++
      }
      const portMax = Math.max(p443, p80, p22, p53, pOther, 1)
      if (p443El) p443El.textContent = p443
      const p443Bar = overlay.querySelector('#globe-fs-p443-bar')
      if (p443Bar) p443Bar.style.width = (p443 / portMax * 100) + '%'
      if (p80El) p80El.textContent = p80
      const p80Bar = overlay.querySelector('#globe-fs-p80-bar')
      if (p80Bar) p80Bar.style.width = (p80 / portMax * 100) + '%'
      if (p22El) p22El.textContent = p22
      const p22Bar = overlay.querySelector('#globe-fs-p22-bar')
      if (p22Bar) p22Bar.style.width = (p22 / portMax * 100) + '%'
      if (p53El) p53El.textContent = p53
      const p53Bar = overlay.querySelector('#globe-fs-p53-bar')
      if (p53Bar) p53Bar.style.width = (p53 / portMax * 100) + '%'
      if (pOtherEl) pOtherEl.textContent = pOther
      const pOtherBar = overlay.querySelector('#globe-fs-pother-bar')
      if (pOtherBar) pOtherBar.style.width = (pOther / portMax * 100) + '%'

      // 更新柱状图历史（最近 12 个时间窗口的活跃连接数）
      this._connHistory.push(est)
      if (this._connHistory.length > 12) {
        this._connHistory.shift()
      }
      // 补齐到 12
      while (this._connHistory.length < 12) {
        this._connHistory.unshift(0)
      }
      this._drawBarChart()

      // 更新性能数字（基于历史趋势的增长率）
      const perfEl = overlay.querySelector('#globe-fs-perf')
      if (perfEl && this._connHistory.length >= 2) {
        const first = this._connHistory[0] || 0
        const last = this._connHistory[this._connHistory.length - 1] || 0
        const growth = first === 0
          ? (last > 0 ? 100 : 0)
          : ((last - first) / Math.max(first, 1)) * 100
        const sign = growth >= 0 ? '+' : ''
        perfEl.textContent = sign + growth.toFixed(1) + '%'
      }
    }).catch(() => {})
  }

  // =====================================================================
  //  3D 立方体绘制
  // =====================================================================

  _startCubeAnimation() {
    this._stopCubeAnimation()
    const cubeCanvas = this._overlay && this._overlay.querySelector('#fs-cube')
    if (!cubeCanvas) return

    // 调整 canvas 像素尺寸以匹配显示尺寸（DPR）
    const dpr = window.devicePixelRatio || 1
    const rect = cubeCanvas.getBoundingClientRect()
    cubeCanvas.width = Math.max(140, Math.round(rect.width * dpr))
    cubeCanvas.height = Math.max(90, Math.round(rect.height * dpr))

    const ctx = cubeCanvas.getContext('2d')
    this._cubeStart = performance.now()
    const tick = () => {
      if (!this._fullscreen) return
      const t = (performance.now() - this._cubeStart) / 1000
      this._drawCube(ctx, cubeCanvas.width, cubeCanvas.height, t)
      this._cubeRAF = requestAnimationFrame(tick)
    }
    this._cubeRAF = requestAnimationFrame(tick)
  }

  _stopCubeAnimation() {
    if (this._cubeRAF) {
      cancelAnimationFrame(this._cubeRAF)
      this._cubeRAF = null
    }
  }

  _drawCube(ctx, w, h, t) {
    const base = this._fsThemeColor || 'rgb(170,207,209)'
    const dim = (a) => base.replace('rgb(', 'rgba(').replace(')', `, ${a})`)
    const cx = w / 2
    const cy = h / 2
    const size = Math.min(w, h) * 0.28
    const ax = t * 0.5
    const ay = t * 0.6

    const cosX = Math.cos(ax), sinX = Math.sin(ax)
    const cosY = Math.cos(ay), sinY = Math.sin(ay)

    // 8 vertices of a unit cube centered at origin
    const vertices = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], // back face
      [-1, -1,  1], [1, -1,  1], [1, 1,  1], [-1, 1,  1]  // front face
    ]
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0], // back
      [4, 5], [5, 6], [6, 7], [7, 4], // front
      [0, 4], [1, 5], [2, 6], [3, 7]  // connectors
    ]

    // Rotate around Y then X, then perspective project
    const fov = 5
    const projected = vertices.map((v) => {
      let x = v[0] * cosY - v[2] * sinY
      let z = v[0] * sinY + v[2] * cosY
      let y = v[1] * cosX - z * sinX
      z = v[1] * sinX + z * cosX
      const scale = fov / (fov + z)
      return {
        x: cx + x * size * scale,
        y: cy + y * size * scale,
        z: z
      }
    })

    // Clear
    ctx.clearRect(0, 0, w, h)

    // 十字定位线（参考图中的图表十字线）
    ctx.strokeStyle = dim(0.15)
    ctx.lineWidth = 1
    ctx.setLineDash([2, 4])
    ctx.beginPath()
    ctx.moveTo(0, cy)
    ctx.lineTo(w, cy)
    ctx.moveTo(cx, 0)
    ctx.lineTo(cx, h)
    ctx.stroke()
    ctx.setLineDash([])

    // 边框刻度
    ctx.strokeStyle = dim(0.12)
    ctx.lineWidth = 0.5
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

    // Draw edges sorted by depth (back to front)
    const sortedEdges = edges.map((e, i) => {
      return {
        e: e,
        depth: (projected[e[0]].z + projected[e[1]].z) / 2
      }
    }).sort((a, b) => a.depth - b.depth)

    for (const ed of sortedEdges) {
      const p1 = projected[ed.e[0]]
      const p2 = projected[ed.e[1]]
      // depth: -1.5..1.5 => alpha: 0.25..0.95
      const alpha = 0.25 + 0.7 * Math.max(0, Math.min(1, (ed.depth + 1.5) / 3))
      ctx.strokeStyle = dim(alpha.toFixed(3))
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
      ctx.stroke()
    }

    // Draw vertices
    for (const p of projected) {
      if (p.z > 0) {
        ctx.fillStyle = base // 前向顶点 — 主题色
      } else {
        ctx.fillStyle = dim(0.55) // 后向顶点 — 主题色半透明
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // =====================================================================
  //  柱状图绘制（最近 12 个时间窗口的活跃连接数）
  // =====================================================================

  _drawBarChart() {
    if (!this._overlay) return
    const canvas = this._overlay.querySelector('#fs-bar-chart')
    if (!canvas) return
    const base = this._fsThemeColor || 'rgb(170,207,209)'
    const dim = (a) => base.replace('rgb(', 'rgba(').replace(')', `, ${a})`)

    // 同步 DPR
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const targetW = Math.max(280, Math.round(rect.width * dpr))
    const targetH = Math.max(80, Math.round(rect.height * dpr))
    if (canvas.width !== targetW) canvas.width = targetW
    if (canvas.height !== targetH) canvas.height = targetH

    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    const data = this._connHistory.slice(-12)
    while (data.length < 12) data.unshift(0)

    ctx.clearRect(0, 0, w, h)

    const padding = { top: 14, right: 8, bottom: 22, left: 8 }
    const chartW = w - padding.left - padding.right
    const chartH = h - padding.top - padding.bottom
    const barCount = data.length
    const barGap = 2 * dpr
    const barW = (chartW - barGap * (barCount - 1)) / barCount

    // 水平网格线
    ctx.strokeStyle = dim(0.1)
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH * i / 4)
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(w - padding.right, y)
      ctx.stroke()
    }

    // 计算最大值（带缓冲）
    const maxVal = Math.max(...data, 1) * 1.1

    // 绘制柱子
    for (let i = 0; i < barCount; i++) {
      const val = data[i]
      const barH = (val / maxVal) * chartH
      const x = padding.left + i * (barW + barGap)
      const y = padding.top + chartH - barH
      const isLatest = i === barCount - 1

      if (barH > 0) {
        // 渐变填充
        const grad = ctx.createLinearGradient(0, y, 0, y + barH)
        if (isLatest) {
          grad.addColorStop(0, dim(0.95))
          grad.addColorStop(1, dim(0.3))
        } else {
          grad.addColorStop(0, dim(0.85))
          grad.addColorStop(1, dim(0.25))
        }
        ctx.fillStyle = grad
        ctx.fillRect(x, y, barW, barH)

        // 顶部高亮
        ctx.fillStyle = isLatest ? base : dim(0.9)
        ctx.fillRect(x, y, barW, Math.min(1.5 * dpr, barH))

        // 边框
        ctx.strokeStyle = isLatest
          ? dim(0.7)
          : dim(0.35)
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y + 0.5, barW - 1, barH - 1)
      } else {
        // 空位显示底线
        ctx.strokeStyle = dim(0.15)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, padding.top + chartH - 0.5)
        ctx.lineTo(x + barW, padding.top + chartH - 0.5)
        ctx.stroke()
      }
    }

    // 顶部最新数值
    const lastVal = data[data.length - 1] || 0
    if (lastVal > 0) {
      const lastX = padding.left + (barCount - 1) * (barW + barGap) + barW / 2
      const lastBarH = (lastVal / maxVal) * chartH
      const lastY = padding.top + chartH - lastBarH
      ctx.fillStyle = base
      ctx.font = `${Math.round(9 * dpr)}px Fira Mono, monospace`
      ctx.textAlign = 'center'
      ctx.fillText(String(lastVal), lastX, Math.max(padding.top + 9 * dpr, lastY - 3 * dpr))
    }

    // X 轴时间线标签（月份缩写 — 匹配参考图风格）
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    ctx.fillStyle = dim(0.5)
    ctx.font = `${Math.round(8 * dpr)}px Fira Mono, monospace`
    ctx.textAlign = 'center'
    for (let i = 0; i < barCount; i++) {
      const x = padding.left + i * (barW + barGap) + barW / 2
      const y = h - 6 * dpr
      ctx.fillText(months[i], x, y)
    }
  }

  // =====================================================================
  //  弧线绘制（基于 2D Canvas 叠加层）
  // =====================================================================

  _drawArcs() {
    if (!this._fullscreen || !this._geo || !this.globe) return

    // 使用当前连接列表，在用户位置和一些活跃连接之间绘制弧线
    // 由于没有 IP 地理定位数据，使用随机偏移生成装饰性弧线
    this._arcTargets = []

    const conns = this._conns || []
    const maxArcs = Math.min(conns.length, 8)
    const userLat = this._geo.lat
    const userLon = this._geo.lon

    for (let i = 0; i < maxArcs; i++) {
      // 在用户位置周围生成随机偏移（视觉装饰效果）
      const offsetLat = (Math.random() - 0.5) * 80
      const offsetLon = (Math.random() - 0.5) * 80
      const targetLat = Math.max(-90, Math.min(90, userLat + offsetLat))
      const targetLon = ((userLon + offsetLon + 180) % 360) - 180
      this._arcTargets.push({ lat: targetLat, lon: targetLon })
    }

    // 弧线实际在 _animate 每帧的 _renderArcs 中绘制
  }

  _clearArcs() {
    this._arcTargets = []
  }

  _renderArcs() {
    if (!this._fullscreen || !this._geo || !this.globe) return
    if (!this._arcTargets || this._arcTargets.length === 0) return

    // 全屏模式下弧线直接使用 Three.js 的线渲染能力
    // 这里用 globe 内置的弧线功能
    try {
      // 简单的视觉弧线：通过 globe 原生方法或 Three.js 绘制
      // 由于 encom-globe 可能不支持动态弧线，使用备用方法
      const userLat = this._geo.lat
      const userLon = this._geo.lon

      for (const target of this._arcTargets) {
        if (this.globe && this.globe.addArc) {
          this.globe.addArc(userLat, userLon, target.lat, target.lon, {
            color: 'rgba(170,207,209,0.15)',
            width: 0.5
          })
        }
      }
    } catch (_) {
      // 弧线绘制失败不影响主功能
    }
  }
}
