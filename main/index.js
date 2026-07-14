import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join, normalize, sep } from 'path'
import os from 'os'
import fs from 'fs'
import { execSync } from 'child_process'
import { WebSocketServer } from 'ws'
import pty from 'node-pty'
import si from 'systeminformation'
import geolite2 from 'geolite2-redist'
import maxmind from 'maxmind'
import { TelemetryHub } from './telemetry.js'

const PORT = 3000
let wss = null
let hub = null

// ====== 可用 Shell 检测 ======
// 格式：{ id: 'powershell', label: 'PowerShell 7', bin: 'pwsh.exe' }
let AVAILABLE_SHELLS = []
function detectShells() {
  const shells = []
  const isWin = process.platform === 'win32'

  // PowerShell（Windows 原生）
  if (isWin) {
    // PowerShell 7 (Core) — `where` 返回的可能是 PATH 里的 shim 路径（不存在的占位），
    // 需用 fs.existsSync 二次验证实际文件存在
    try {
      const out = execSync('where pwsh.exe', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      const first = (out || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean)
      if (first && fs.existsSync(first)) {
        shells.push({ id: 'pwsh', label: 'PowerShell 7 (Core)', bin: first })
      }
    } catch (_) {}
    shells.push({ id: 'powershell', label: 'PowerShell 5 (Windows)', bin: 'powershell.exe' })
  } else {
    shells.push({ id: 'bash', label: 'Bash', bin: 'bash' })
  }

  // Git Bash（Windows 下检测）
  if (isWin) {
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
    ]
    let gitBin = null
    for (const p of gitBashPaths) {
      if (fs.existsSync(p)) { gitBin = p; break }
    }
    // 也能在 PATH 里找 git → 解析实际 bash.exe 路径
    if (!gitBin) {
      try {
        const out = execSync('where git', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
        const gitExe = (out || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean)
        if (gitExe) {
          // git.exe 通常在 C:\Program Files\Git\cmd\git.exe，对应 bash.exe 在 \mingw64\bin\bash.exe
          const guessBash = gitExe.replace(/[\\/]cmd[\\/]git\.exe$/i, '\\mingw64\\bin\\bash.exe')
          if (fs.existsSync(guessBash)) gitBin = guessBash
        }
      } catch (_) {}
    }
    if (gitBin) shells.push({ id: 'git', label: 'Git Bash', bin: gitBin })
  } else {
    // Linux/macOS：检测 git
    try {
      execSync('git --version', { stdio: 'ignore' })
      shells.push({ id: 'git', label: 'Git Bash', bin: 'git' })
    } catch (_) {}
  }

  AVAILABLE_SHELLS = shells
}

// ====== 多终端管理器 ======
const terminals = new Map() // termId → { pty, shell }
let _nextTermId = 0

function startTerminalServer() {
  detectShells()

  wss = new WebSocketServer({ port: PORT })
  wss.on('connection', (ws) => {
    // 通知渲染端可用 shell 列表
    ws.send(JSON.stringify({ type: 'shells', shells: AVAILABLE_SHELLS }))

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      const { termId, type, data, cols, rows, shell: shellId } = msg

      if (type === 'create') {
        const id = String(++_nextTermId)
        // 根据 shellId 选择执行文件
        let bin, args = [], env = process.env
        if (shellId === 'pwsh') {
          const found = AVAILABLE_SHELLS.find((s) => s.id === 'pwsh')
          bin = found ? found.bin : 'pwsh.exe'
        }
        else if (shellId === 'git') {
          const found = AVAILABLE_SHELLS.find((s) => s.id === 'git')
          bin = found ? found.bin : 'bash'
          args = ['--login']
          // Git Bash 需要 MSYSTEM 环境变量才显示 MINGW64 路径
          env = Object.assign({}, process.env)
          env.MSYSTEM = 'MINGW64'
          env.CHERE_INVOKING = '1'
        } else {
          bin = process.platform === 'win32' ? 'powershell.exe' : 'bash'
        }
        let p
        try {
          p = pty.spawn(bin, args, {
            name: 'xterm-256color', cols: cols || 80, rows: rows || 24,
            cwd: process.env.HOME || process.env.USERPROFILE,
            env
          })
        } catch (err) {
          // spawn 失败（File not found 等）：发错误到渲染端，不让进程崩溃
          try { ws.send(JSON.stringify({ termId: id, type: 'spawn_error', error: err.message || String(err) })) } catch {}
          return
        }
        const onData = (d) => { try { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ termId: id, type: 'output', data: d })) } catch {} }
        p.on('data', onData)
        p.on('exit', () => {
          // 标记 exited，后续 resize/input 直接拒绝调用 pty
          const t = terminals.get(id)
          if (t) t.exited = true
          try { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ termId: id, type: 'exit' })) } catch {}
        })
        terminals.set(id, { pty: p, shell: shellId || 'powershell', onData, exited: false })
        ws.send(JSON.stringify({ termId: id, type: 'created', shell: shellId || 'powershell' }))
        return
      }

      if (type === 'close') {
        const t = terminals.get(termId)
        if (t) { t.pty.removeListener('data', t.onData); try { t.pty.kill() } catch (_) {} ; terminals.delete(termId) }
        return
      }

      if (type === 'resize') {
        const t = terminals.get(termId)
        if (t && !t.exited) {
          try { t.pty.resize(cols, rows) } catch (_) { /* pty 已死，忽略 */ }
        }
        return
      }

      if (type === 'input') {
        const t = terminals.get(termId)
        if (t && !t.exited) {
          try { t.pty.write(data) } catch (_) { /* pty 已死，忽略 */ }
        }
        return
      }
    })
    ws.on('close', () => {})
    ws.on('error', () => {})
  })
}

function createWindow() {
  const win = new BrowserWindow({
    fullscreen: true,                    // 与原 eDEX-UI 一致：全屏沉浸
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: true
    }
  })

  // 开发阶段把渲染进程的 Console 转发到主进程终端，方便排查；但不再自动打开 DevTools，避免中文提示弹窗干扰
  const isDev = !!process.env.ELECTRON_RENDERER_URL
  if (isDev) {
    // 如需 DevTools 可手动按 Ctrl+Shift+I
    console.log('[main] dev mode, DevTools 手动打开 (Ctrl+Shift+I)')
  } else {
    // 临时调试：打包后自动开 DevTools，便于查黑屏问题
    win.webContents.openDevTools({ mode: 'detach' })
  }
  win.webContents.on('console-message', (event) => {
    const { level, message, lineNumber, sourceId } = event
    const labels = ['debug', 'log', 'warn', 'error']
    const label = labels[level] ?? 'log'
    console.log(`[renderer:${label}] ${message}${sourceId ? ` (${sourceId}:${lineNumber})` : ''}`)
  })
  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    console.error(`[main] load failed: ${validatedURL} -> ${errorCode} ${errorDescription}`)
  })
  // preload 错误捕获：例如 preload 文件找不到或脚本异常
  win.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error(`[main] preload error: ${preloadPath} -> ${error.message || error}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[main] render process gone: ${JSON.stringify(details)}`)
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  console.log('[main] ELECTRON_RENDERER_URL =', rendererUrl)
  if (rendererUrl) {
    win.loadURL(rendererUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  startTerminalServer()
  const win = createWindow()
  // 遥测中枢：窗口就绪后启动批量系统监控广播
  hub = new TelemetryHub(win)
  hub.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// ====== 系统监控代理 ======
ipcMain.handle('si', async (_e, method, args) => {
  try {
    if (method === 'uptime') return os.uptime()
    if (method === 'platform') return process.platform
    if (method === 'type') return os.type()
    if (method === 'hostname') return os.hostname()
    if (typeof si[method] === 'function') {
      return await si[method](...(args || []))
    }
    throw new Error('unknown si method: ' + method)
  } catch (err) {
    console.error('[main] si call failed:', method, err.message)
    throw err
  }
})

// 文件系统代理：渲染端通过 IPC 读取目录。
// 安全边界：渲染进程无任何 node 访问，仅能经白名单 IPC 取得数据；此处再限制可被浏览的路径范围——
// 默认允许 home 目录子树，外加所有已挂载卷的根（即 Show disks 视图列出的设备），其余路径拒绝。
const HOME_DIR = os.homedir()
const IS_WIN = process.platform === 'win32'
let ALLOWED_ROOTS = null
async function refreshAllowedRoots() {
  const roots = [HOME_DIR]
  try {
    const blocks = await si.blockDevices()
    blocks
      .filter((b) => b.mount && fs.existsSync(b.mount))
      .forEach((b) => { if (!roots.includes(b.mount)) roots.push(b.mount) })
  } catch (_) { /* 取不到设备列表就只用 home */ }
  ALLOWED_ROOTS = roots
  return roots
}
function isUnder(target, root) {
  const t = IS_WIN ? target.toLowerCase() : target
  const r = IS_WIN ? root.toLowerCase() : root
  if (t === r) return true
  const rs = r.endsWith(sep) ? r : r + sep
  if (t.startsWith(rs)) return true
  // Windows 盘符根：C: 与 C:\ 视为同根，兼容 systeminformation 两种 mount 写法
  const drv = /^([a-z]:)(?:[\\/]?)$/.exec(r)
  if (drv) {
    const alt = drv[1] + (r.endsWith(sep) ? '' : sep)
    if (t === alt || t.startsWith(alt)) return true
  }
  return false
}
async function safePath(p) {
  const target = normalize(p)
  if (!ALLOWED_ROOTS) await refreshAllowedRoots()
  if (!ALLOWED_ROOTS.some((r) => isUnder(target, r))) {
    throw new Error('path out of bounds: ' + p)
  }
  return target
}

ipcMain.handle('fs-readDir', async (_e, dirPath) => {
  try {
    const target = await safePath(dirPath || HOME_DIR)
    const entries = await fs.promises.readdir(target, { withFileTypes: true })
    const list = await Promise.all(
      entries
        .filter((e) => e.name !== '.' && e.name !== '..')
        .map(async (e) => {
          let size = 0
          let mtime = 0
          try {
            const st = await fs.promises.lstat(join(target, e.name))
            if (st.isFile()) size = st.size
            mtime = st.mtimeMs || 0
          } catch (_) { /* EPERM/拒绝访问：占位 0 */ }
          return {
            name: e.name,
            isDir: e.isDirectory(),
            isFile: e.isFile(),
            isSymlink: e.isSymbolicLink(),
            size,
            mtime
          }
        })
    )
    return list
  } catch (err) {
    console.error('[main] fs-readDir error for path=', JSON.stringify(dirPath), 'home=', HOME_DIR, 'msg=', err.message)
    // 路径无效时返回空数组（而不是抛错），避免渲染端显示 "Error invoking remote"
    return []
  }
})

ipcMain.handle('fs-getHome', () => {
  if (!HOME_DIR || HOME_DIR === '') {
    // 极端情况兜底：返回当前工作目录
    console.warn('[main] fs-getHome: HOME_DIR empty, fallback to process.cwd()')
    return process.cwd()
  }
  return HOME_DIR
})

// 磁盘可用空间（原版用 si.fsSize() 直接算，不依赖遥测）：传入当前路径返回匹配的挂载块
// 性能优化（热点 5）：si.fsSize() 在 Windows WMI 上约 1s，导航/点击高频触发会占满主进程 IPC 队列。
// 按解析后路径做短 TTL 缓存（5s），TTL 内直接返回缓存值，过期才重新查询。
const FS_SPACE_TTL_MS = 5000
const fsSpaceCache = new Map() // resolvedPath -> { ts, value }
ipcMain.handle('fs-space', async (_e, dirPath) => {
  try {
    const target = await safePath(dirPath || HOME_DIR)
    const now = Date.now()
    const cached = fsSpaceCache.get(target)
    if (cached && now - cached.ts < FS_SPACE_TTL_MS) return cached.value
    const blocks = await si.fsSize()
    const block = blocks.find((b) => b.mount && target.startsWith(b.mount)) || blocks[0]
    const value = block ? { mount: block.mount, used: block.used, size: block.size, use: block.use } : null
    fsSpaceCache.set(target, { ts: now, value })
    // 防止长会话中缓存无限增长（用户可访问的目录数有限，这里仅作兜底）
    if (fsSpaceCache.size > 256) fsSpaceCache.clear()
    return value
  } catch (err) {
    console.error('[main] fs-space error:', err.message)
    return null
  }
})

// 列出可用块设备（原版 Show disks 视图）
ipcMain.handle('fs-listDrives', async () => {
  try {
    const normMount = (s) => (s || '').replace(/[\\/]+$/, '').toUpperCase()
    const blocks = await si.blockDevices()
    const seen = new Set()
    const devices = []
    blocks
      .filter((b) => b.mount && fs.existsSync(b.mount))
      .forEach((b) => {
        const m = normMount(b.mount)
        seen.add(m)
        devices.push({
          name: b.label && b.label !== '' ? `${b.label} (${b.name})` : `${b.mount} (${b.name})`,
          type: b.removable && b.type !== 'rom' ? 'usb' : (b.type === 'rom' ? 'rom' : 'disk'),
          path: b.mount
        })
      })
    // Windows 兜底：扫描所有盘符，补 blockDevices 可能漏掉的已挂载卷（确保不止 C: 可访问）
    // 去重用 normMount（去掉尾斜杠后大写），避免 C: 与 C:\ 被判为两个
    if (process.platform === 'win32') {
      for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const p = `${L}:\\`
        const n = normMount(p)
        if (!seen.has(n) && fs.existsSync(p)) {
          devices.push({ name: `${p} (${L}:)`, type: 'disk', path: p })
          seen.add(n)
        }
      }
    }
    return devices
  } catch (err) {
    console.error('[main] fs-listDrives error:', err.message)
    return []
  }
})

// 在资源管理器中打开（文件夹 openPath，文件 showItemInFolder 选中）
ipcMain.handle('fs-openInExplorer', async (_e, filePath, isDir) => {
  try {
    const target = await safePath(filePath)
    if (isDir) await shell.openPath(target)
    else shell.showItemInFolder(target)
    return true
  } catch (err) {
    console.error('[main] fs-openInExplorer error:', err.message)
    return false
  }
})

// 读取单个文件（用于媒体播放 / PDF 阅读），同样限定在 home 目录内，返回二进制 + MIME
function mimeFromName(p) {
  const ext = (p.split('.').pop() || '').toLowerCase()
  const map = {
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    m4a: 'audio/mp4', aac: 'audio/aac',
    pdf: 'application/pdf',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    txt: 'text/plain', md: 'text/markdown', json: 'application/json'
  }
  return map[ext] || 'application/octet-stream'
}

ipcMain.handle('fs-readFile', async (_e, filePath) => {
  const target = await safePath(filePath)
  const stat = await fs.promises.stat(target)
  if (stat.isDirectory()) throw new Error('not a file: ' + filePath)
  if (stat.size > 120 * 1024 * 1024) throw new Error('file too large (>120MB)')
  const buf = await fs.promises.readFile(target)
  // 仅返回底层 ArrayBuffer 的精确切片，避免把整个 Buffer pool 传过去
  const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return { data, mime: mimeFromName(target), size: stat.size }
})

// 用系统默认浏览器打开外部链接（更新下载页等）
ipcMain.handle('open-external', async (_e, url) => {
  try { await shell.openExternal(url) } catch (e) { console.error('[main] open-external failed', e.message) }
})

// 解析 package.json 的 repository.url -> "owner/repo"（含占位符则返回 null）
function parseRepo() {
  try {
    const pkg = JSON.parse(fs.readFileSync(join(app.getAppPath(), 'package.json'), 'utf-8'))
    const url = pkg && pkg.repository && pkg.repository.url
    if (!url || url.includes('<')) return null
    const m = /github\.com\/([^/]+)\/([^/.]+)/.exec(url)
    return m ? `${m[1]}/${m[2]}` : null
  } catch (e) {
    return null
  }
}

function compareVer(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0)
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0
    if (x !== y) return x - y
  }
  return 0
}

// 更新检查：主进程去 GitHub 取最新 release（渲染端不直接联网）
ipcMain.handle('check-update', async () => {
  const current = app.getVersion()
  const repo = parseRepo()
  if (!repo) return { current, status: 'unconfigured' }
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { 'User-Agent': 'eDEX-UI-Plus' }
    })
    if (!res.ok) return { current, status: 'offline' }
    const d = await res.json()
    const latest = String(d.tag_name || '').replace(/^v/, '')
    const cmp = compareVer(latest, current)
    return { current, latest, url: d.html_url, status: cmp === 0 ? 'uptodate' : cmp > 0 ? 'update' : 'dev' }
  } catch (e) {
    return { current, status: 'offline' }
  }
})

// GeoIP：主进程用 GeoLite2-City + 公网 IP 解析出口经纬度
// 注：geolite2-redist 的自动更新器因 SSL 证书验证问题（UNABLE_TO_VERIFY_LEAF_SIGNATURE）
// 会在启动时打 "GeoLite 数据库自更新是许可证强制要求" 的警告。数据库下载失败不影响功能，
// 地球模块会回退到在线免费 API（ipwho.is / ipinfo.io / ip-api.com），已静默该已知警告。
let geoReader = null
async function getGeoReader() {
  if (geoReader !== null) return geoReader
  // 临时抑制 geolite2-redist 自动更新器的已知 SSL 警告
  const _origWarn = console.warn
  console.warn = (...args) => {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('GeoLite')) return
    _origWarn.apply(console, args)
  }
  try {
    const dbPath = geolite2.open('GeoLite2-City')
    geoReader = maxmind.openSync(dbPath)
  } catch (e) {
    geoReader = false
    _origWarn('[geoip] database unavailable:', e.message)
  } finally {
    console.warn = _origWarn
  }
  return geoReader
}

ipcMain.handle('geoip-lookup', async () => {
  try {
    // 1) 优先本地 GeoLite2 数据库（准确、可离线）。失败时 getGeoReader 会缓存 false，
    //    后续 30s 轮询不再重复下载，直接走在线兜底。
    const reader = await getGeoReader()
    if (reader) {
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json')
        const { ip } = await ipRes.json()
        const geo = reader.get(ip)
        if (geo && geo.location) {
          return { ip, lat: geo.location.latitude, lon: geo.location.longitude }
        }
        return { ip, lat: null, lon: null }
      } catch (_) { /* 取 IP/查库失败，落到在线 API */ }
    }
    // 2) 无本地库：用在线 IP 地理定位 API 兜底（无需本地数据库，修复离线面板卡 OFFLINE）
    const online = await fetchOnlineGeo()
    if (online) return online
    return { offline: true, reason: 'no-geo-source' }
  } catch (e) {
    return { offline: true, reason: String(e.message) }
  }
})

// 在线 IP 地理定位兜底：依次尝试多个免 Key 公共服务，任一成功即返回 {ip,lat,lon}
// 注意：ipapi.co 已被 Cloudflare 拦截，ip-api.com 部分地区不稳定，故主用 ipwho.is / ipinfo.io
async function fetchOnlineGeo() {
  const sources = [
    { url: 'https://ipwho.is/', parse: (d) => ({ lat: d.latitude, lon: d.longitude, ip: d.ip }) },
    { url: 'https://ipinfo.io/json', parse: (d) => {
        if (!d.loc) return null
        const [la, lo] = String(d.loc).split(',')
        return { lat: Number(la), lon: Number(lo), ip: d.ip }
      } },
    { url: 'https://ip-api.com/json/', parse: (d) => ({ lat: d.lat, lon: d.lon, ip: d.query }) }
  ]
  for (const { url, parse } of sources) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 4000)
      const res = await fetch(url, { signal: ctrl.signal })
      clearTimeout(timer)
      if (!res.ok) continue
      const d = await res.json()
      const p = parse(d)
      if (p && typeof p.lat === 'number' && typeof p.lon === 'number') {
        return { ip: p.ip ?? null, lat: p.lat, lon: p.lon }
      }
    } catch (_) { /* 该服务失败，尝试下一个 */ }
  }
  return null
}

// ====== 设置持久化（热重载，不重启） ======
const SETTINGS_PATH = join(HOME_DIR, '.edex-ui-plus-settings.json')
const DEFAULT_SETTINGS = {
  shell: process.platform === 'win32' ? 'powershell.exe' : 'bash',
  cwd: HOME_DIR,
  theme: 'tron',
  keyboard: 'en-US',
  termFontSize: 15,
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: 1000,
  lineHeight: 1.2,
  letterSpacing: 0,
  clockHours: 24,
  language: 'zh',
  audio: true,
  audioVolume: 1.0,
  audioAmp: 1.4,
  hideDotfiles: false,
  fsListView: false,
  animSpeed: 25,
  pingAddr: '1.1.1.1',
  bootLogo: 'eDEX-UI-Plus',
  newTermPrompt: true,
  defaultTermShell: '',
  closeTermPrompt: true,
}
function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch (_) { return { ...DEFAULT_SETTINGS } }
}
function saveSettings(data) {
  try {
    // 校验
    const validated = { ...data }
    if (validated.termFontSize != null) {
      const v = parseInt(validated.termFontSize, 10)
      validated.termFontSize = Math.max(8, Math.min(48, isNaN(v) ? DEFAULT_SETTINGS.termFontSize : v))
    }
    if (validated.audioVolume != null) {
      const v = parseFloat(validated.audioVolume)
      validated.audioVolume = isNaN(v) ? DEFAULT_SETTINGS.audioVolume : Math.max(0, Math.min(1, v))
    }
    if (validated.audioAmp != null) {
      const v = parseFloat(validated.audioAmp)
      validated.audioAmp = isNaN(v) ? DEFAULT_SETTINGS.audioAmp : Math.max(0.5, Math.min(3.0, v))
    }
    if (validated.animSpeed != null) {
      const allowed = [0, 12, 25, 50]
      const v = parseInt(validated.animSpeed, 10)
      validated.animSpeed = allowed.includes(v) ? v : DEFAULT_SETTINGS.animSpeed
    }
    if (validated.clockHours != null) {
      const v = parseInt(validated.clockHours, 10)
      validated.clockHours = (v === 12 || v === 24) ? v : DEFAULT_SETTINGS.clockHours
    }
    if (validated.lineHeight != null) {
      const v = parseFloat(validated.lineHeight)
      validated.lineHeight = isNaN(v) ? DEFAULT_SETTINGS.lineHeight : Math.max(1.0, Math.min(2.0, v))
    }
    if (validated.letterSpacing != null) {
      const v = parseFloat(validated.letterSpacing)
      validated.letterSpacing = isNaN(v) ? DEFAULT_SETTINGS.letterSpacing : Math.max(0, Math.min(10, v))
    }
    if (validated.scrollback != null) {
      const v = parseInt(validated.scrollback, 10)
      validated.scrollback = isNaN(v) ? DEFAULT_SETTINGS.scrollback : Math.max(100, Math.min(100000, v))
    }
    if (validated.newTermPrompt != null) {
      validated.newTermPrompt = validated.newTermPrompt === true || validated.newTermPrompt === 'true'
    }
    if (validated.defaultTermShell != null) {
      // str, 直接透传
    }
    if (validated.closeTermPrompt != null) {
      validated.closeTermPrompt = validated.closeTermPrompt === true || validated.closeTermPrompt === 'true'
    }
    // 确保目录存在
    const dir = join(SETTINGS_PATH, '..')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(validated, null, 2), 'utf-8')
    return true
  } catch (e) {
    console.error('[main] save settings error:', e.message)
    return false
  }
}
// 可用主题列表（主题目录内的 .json 文件）
function listThemes() {
  const appDir = app.getAppPath()
  const dir = join(appDir, '..', 'edex-ui-master', 'src', 'assets', 'themes')
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
  } catch (_) { return [] }
}
// 可用键盘布局列表（键盘目录内的 .json 文件）
function listKeyboards() {
  const appDir = app.getAppPath()
  const dir = join(appDir, 'renderer', 'assets', 'keyboards')
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
  } catch (_) { return [] }
}

ipcMain.handle('settings-read', async () => {
  return { settings: loadSettings(), themes: listThemes(), keyboards: listKeyboards() }
})
ipcMain.handle('settings-write', async (_e, data) => {
  return saveSettings(data)
})
ipcMain.handle('app-restart', async () => {
  // 热重载模式：不重启，由渲染端自行重载运行中的模块
  return true
})
ipcMain.handle('app-quit', async () => {
  app.quit()
})

// 可用 Shell 列表
ipcMain.handle('get-available-shells', async () => {
  if (!AVAILABLE_SHELLS.length) detectShells()
  return { shells: AVAILABLE_SHELLS }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (hub) hub.stop()
  terminals.forEach((t) => { try { t.pty.kill() } catch {} })
  terminals.clear()
  if (wss) wss.close()
})
