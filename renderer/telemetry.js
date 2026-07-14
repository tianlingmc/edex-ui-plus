// 渲染端遥测客户端：对应原版各模块各自 IPC 轮询的替代方案。
// 主进程 TelemetryHub 每 1s 只发【一条】telemetry 广播，本模块统一接收并分发给订阅者，
// 各监控模块订阅后只在数据变化时更新自己的 DOM，避免高频 IPC 往返与 DOM 抖动。

let latest = null
const subs = new Set()

export function initTelemetry() {
  if (!window.eDEX || typeof window.eDEX.onTelemetry !== 'function') {
    console.warn('[telemetry] onTelemetry 不可用，模块将无数据')
    return
  }
  window.eDEX.onTelemetry((data) => {
    latest = data
    subs.forEach((fn) => {
      try { fn(data) } catch (e) { console.error('[telemetry] subscriber error', e.message) }
    })
  })
}

// 订阅每次遥测推送；若已有最新数据会立即回调一次。返回取消订阅函数。
export function onTelemetry(fn) {
  subs.add(fn)
  if (latest) {
    try { fn(latest) } catch (e) { /* ignore */ }
  }
  return () => subs.delete(fn)
}

export function getTelemetry() {
  return latest
}
