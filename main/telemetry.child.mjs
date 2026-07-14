// telemetry child process: 对应原版 _multithread.js 的 worker 角色。
// 在独立 Node 进程中运行 systeminformation 扫描，按错峰节奏聚合数据，
// 每 1s 向父进程发送一条 telemetry payload，主进程只做 IPC 转发。
//
// 性能与初始填充要点（2026-07-13）：
//   1. 自调度 setTimeout 循环替代 setInterval：scan() 是异步且单次可能 >1s，避免并行堆叠打满 CPU。
//   2. 内存活跃/总量改用 os.totalmem()/os.freemem() 即时读取；si.mem() 仅低频取 SWAP。
//   3. 接口名每 tick 都解析（缓存 30s），payload.net 始终带 iface，Netstat/Conninfo 不会长期 OFFLINE。
//   4. 首次扫描做并行引导拉取，让 HardwareInspector（system/chassis）等慢模块在启动后数秒内出现数据。

import os from 'os'
import si from 'systeminformation'

const TICK_MS = 1000

const CADENCE = {
  currentLoad: 1, // ~2ms，喂 Cpuinfo 实时负载折线
  memSwap: 10,    // si.mem() 取 SWAP，低频
  net: 3,         // networkStats 在 Windows 上 ~4s，降到每 3 tick
  temp: 2,        // win32 下跳过
  cpu: 5,         // 型号/核数变化极慢
  processes: 5,   // 进程表
  battery: 10,    // 电量
  interfaces: 5,  // 网卡列表/IP
  hardware: 30,   // 内存/硬盘/显卡布局，首扫不拉以控制启动时间
  system: 30      // 制造商/型号/机箱，首扫会拉一次保证 HardwareInspector 立即出现
}

let iface = null
let ifaceCheckedAt = 0
let tick = 0
let stopped = false
let timer = null
const cache = {
  cpu: null,
  temp: null,
  battery: null,
  processes: null,
  interfaces: null,
  hardware: null,
  system: null,
  chassis: null,
  rx_sec: 0,
  tx_sec: 0,
  swapUsed: 0,
  swapTotal: 0
}

async function resolveIface() {
  const now = Date.now()
  if (iface && now - ifaceCheckedAt < 30000) return iface
  ifaceCheckedAt = now
  try {
    const def = await si.networkInterfaceDefault()
    if (def) { iface = def; return def }
  } catch (_) { /* ignore */ }
  try {
    const list = await si.networkInterfaces()
    const up = list.find((i) => i.operstate === 'up' && i.ip4) || list[0]
    iface = up ? up.iface : null
  } catch (_) { iface = null }
  return iface
}

async function updateCurrentLoad(t, full, payload) {
  if (!full && t % CADENCE.currentLoad !== 0) return
  const load = await si.currentLoad().catch(() => null)
  if (load) {
    payload.currentLoad = {
      avg: Math.round(load.currentLoad || 0),
      cpus: (load.cpus || []).map((c) => ({ cpu: c.cpu, load: Math.round(c.load || 0) }))
    }
  }
}

async function updateMemSwap(t, full, payload) {
  if (!full && t % CADENCE.memSwap !== 0) return
  const m = await si.mem().catch(() => null)
  if (m) {
    cache.swapUsed = m.swapused || 0
    cache.swapTotal = m.swaptotal || 0
    payload.mem.swapUsed = cache.swapUsed
    payload.mem.swapTotal = cache.swapTotal
  }
}

async function updateNet(t, full, payload) {
  if (!full && t % CADENCE.net !== 0) return
  const ifname = await resolveIface()
  if (!ifname) return
  const stats = await si.networkStats(ifname).catch(() => null)
  const s = Array.isArray(stats) ? stats[0] : stats
  if (s) {
    cache.rx_sec = s.rx_sec || 0
    cache.tx_sec = s.tx_sec || 0
  }
  payload.net = { iface: ifname, rx_sec: cache.rx_sec, tx_sec: cache.tx_sec }
}

async function updateCpu(t, full, payload) {
  if (!full && t % CADENCE.cpu !== 0) return
  const c = await si.cpu().catch(() => null)
  if (c) {
    cache.cpu = {
      brand: (c.manufacturer + ' ' + c.brand).trim().substr(0, 30),
      manufacturer: c.manufacturer,
      speed: c.speed,
      speedMax: c.speedMax,
      cores: c.cores
    }
  }
  payload.cpu = cache.cpu
}

async function updateProcesses(t, full, payload) {
  if (!full && t % CADENCE.processes !== 0) return
  const p = await si.processes().catch(() => null)
  cache.processes = p ? {
    all: p.all,
    list: (p.list || [])
      .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
      .slice(0, 15)
      .map((p) => ({ name: p.name, pid: p.pid, cpu: p.cpu, mem: p.mem }))
  } : null
  payload.processes = cache.processes
}

async function updateBattery(t, full, payload) {
  if (!full && t % CADENCE.battery !== 0) return
  const b = await si.battery().catch(() => null)
  cache.battery = b || null
  payload.battery = cache.battery
}

async function updateInterfaces(t, full, payload) {
  if (!full && t % CADENCE.interfaces !== 0) return
  const list = await si.networkInterfaces().catch(() => null)
  cache.interfaces = Array.isArray(list) ? list : null
  payload.interfaces = cache.interfaces
}

async function updateHardware(t, full, payload) {
  // 首扫不拉 hardware：diskLayout/graphics 在 Windows 上可达 6-10s，会阻塞首条 telemetry
  // 的到达时间。HardwareInspector 依赖 system/chassis，而非 hardware。
  if (full) return
  if (t % CADENCE.hardware !== 0) return
  const [memLayout, diskLayout, graphics, osInfo, fsSize] = await Promise.all([
    si.memLayout().catch(() => null),
    si.diskLayout().catch(() => null),
    si.graphics().catch(() => null),
    si.osInfo().catch(() => null),
    si.fsSize().catch(() => null)
  ])
  cache.hardware = { memLayout, diskLayout, graphics, osInfo }
  payload.hardware = cache.hardware
  payload.fsSize = Array.isArray(fsSize) ? fsSize : null
}

async function updateSystem(t, full, payload) {
  if (!full && t % CADENCE.system !== 0) return
  const [system, chassis] = await Promise.all([
    si.system().catch(() => null),
    si.chassis().catch(() => null)
  ])
  cache.system = system || null
  cache.chassis = chassis || null
  payload.system = cache.system
  payload.chassis = cache.chassis
}

async function updateTemp(t, full, payload) {
  if (!full && t % CADENCE.temp !== 0) return
  if (process.platform === 'win32') return
  const tp = await si.cpuTemperature().catch(() => null)
  cache.temp = tp ? (tp.max ?? tp.main ?? null) : null
  payload.temp = cache.temp
}

async function scan() {
  tick++
  const t = tick
  const full = t === 1
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const payload = {
    tick: t,
    platform: process.platform,
    osType: os.type(),
    hostname: os.hostname(),
    sysUptime: os.uptime(),
    currentLoad: null,
    mem: {
      total: totalMem,
      free: freeMem,
      active: totalMem - freeMem,
      used: totalMem - freeMem,
      swapUsed: cache.swapUsed,
      swapTotal: cache.swapTotal
    },
    net: iface ? { iface, rx_sec: cache.rx_sec, tx_sec: cache.tx_sec } : null,
    temp: cache.temp,
    battery: cache.battery,
    cpu: cache.cpu,
    processes: cache.processes,
    interfaces: cache.interfaces,
    hardware: cache.hardware,
    system: cache.system,
    chassis: cache.chassis,
    fsSize: null
  }

  try {
    // 快调用（1s/TICK）在此 Promise.all 中并发执行；慢调用（updateNet/updateHardware）
    // 由独立自调度 startSlowTasks 管理，结果写入 cache，scan 仅读取
    await Promise.all([
      updateCurrentLoad(t, full, payload),
      updateMemSwap(t, full, payload),
      updateCpu(t, full, payload),
      updateProcesses(t, full, payload),
      updateBattery(t, full, payload),
      updateInterfaces(t, full, payload),
      updateSystem(t, full, payload),
      updateTemp(t, full, payload)
    ])
  } catch (err) {
    console.error('[telemetry child] scan error:', err.message)
  }
  if (process.send) process.send({ type: 'telemetry', payload })
}

// 慢调用独立自调度（热点 1）：si.diskLayout()/si.graphics() 等 Windows 6-10s、
// si.networkStats() ~4s，不参与 scan 的 Promise.all，以免阻塞 1s 快数据广播。
// 网络每 3s 刷新，硬件每 30s 刷新，首扫立即执行一次保证面板数据出现。
async function slowNetTask() {
  if (stopped) return
  const ifname = await resolveIface()
  if (ifname) {
    const stats = await si.networkStats(ifname).catch(() => null)
    const s = Array.isArray(stats) ? stats[0] : stats
    if (s) {
      cache.rx_sec = s.rx_sec || 0
      cache.tx_sec = s.tx_sec || 0
    }
  }
  if (!stopped) setTimeout(slowNetTask, 3000)
}

async function slowHardwareTask() {
  const [memLayout, diskLayout, graphics, osInfo, fsSize] = await Promise.all([
    si.memLayout().catch(() => null),
    si.diskLayout().catch(() => null),
    si.graphics().catch(() => null),
    si.osInfo().catch(() => null),
    si.fsSize().catch(() => null)
  ])
  cache.hardware = { memLayout, diskLayout, graphics, osInfo }
  cache.fsSize = Array.isArray(fsSize) ? fsSize : null
  if (!stopped) setTimeout(slowHardwareTask, 30000)
}

function startSlowTasks() {
  // 首扫立即跑一次保证面板有数据，再依节奏自调度
  setTimeout(() => { slowNetTask() }, 3000)   // 3s 后首跑，之后每 3s
  setTimeout(() => { slowHardwareTask() }, 0) // 立即首跑，之后每 30s
}

async function loop() {
  if (stopped) return
  try { await scan() } catch (e) { console.error('[telemetry child] loop error:', e.message) }
  if (!stopped) timer = setTimeout(loop, TICK_MS)
}

process.on('message', (msg) => {
  if (msg && msg.type === 'stop') {
    stopped = true
    if (timer) clearTimeout(timer)
    process.exit(0)
  }
})

loop()
startSlowTasks()
