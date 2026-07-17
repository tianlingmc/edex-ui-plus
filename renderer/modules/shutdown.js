// 关闭动画模块：监听主进程发来的 'app:shutdown'，重放启动 logo 故障动画，
// 随后整体缓慢淡出到黑，再经 window.eDEX.shutdown() 回执主进程真正关窗。
// 复用启动序列的 displayTitleScreen（通过 replayLogo），不新增任何资源/依赖。
//
// 安全模型：contextIsolation 开启，渲染进程只能经 window.eDEX 调用主进程。
// 本模块通过 window.eDEX.on('app:shutdown', cb) 订阅主进程广播，
// 通过 window.eDEX.shutdown() 回执（内部 ipcRenderer.send('app:shutdown-done')）。

import { replayLogo } from '../boot.js'

// 本地延时 helper（与 boot.js 的同名逻辑一致，避免在关机模块反向依赖 boot 的内部函数）
const _delay = (ms) => new Promise((r) => setTimeout(r, ms))

// 防重入：避免同一关闭事件被多次触发导致动画/淡出叠加
let _shuttingDown = false

/**
 * 初始化关闭动画监听。在渲染入口（main.js）初始化其它模块后调用一次即可。
 * 若安全桥 window.eDEX / eDEX.on 不存在则静默退出，
 * 主进程的超时兜底（win.destroy）仍会关窗，不会卡死。
 */
export function initShutdown() {
  if (!window.eDEX || typeof window.eDEX.on !== 'function') return
  window.eDEX.on('app:shutdown', () => {
    playShutdown().catch(() => {})
  })
}

// 重放 logo 故障动画并缓慢淡出到黑，随后回执主进程关窗。
// 任何异常都保证回调 window.eDEX.shutdown()，绝不卡死（主进程超时兜底也会强关）。
async function playShutdown() {
  if (_shuttingDown) return
  _shuttingDown = true

  // 1) 重放启动 logo 故障动画（内部会播 theme 音效，与开机一致）。
  //    若重放失败，直接回执关窗，避免卡在半透明遮罩。
  let screen
  try {
    screen = await replayLogo()
  } catch (_) {
    try { window.eDEX.shutdown() } catch (__){}
    return
  }

  // 2) 重放未产出有效的 screen（理论上不会发生），直接关窗
  if (!screen || !screen.parentNode) {
    try { window.eDEX.shutdown() } catch (_) {}
    return
  }

  // 3) 先让 logo 标题完整淡出退场，否则黑屏淡出时 logo 仍浮在屏上
  const logoEl = screen.querySelector('h1')
  if (logoEl) {
    logoEl.style.transition = 'opacity 0.7s ease'
    void logoEl.offsetWidth // 强制重排，使 transition 立即生效
    logoEl.style.opacity = '0'
    await _delay(700)
  }

  // 4) logo 退场后整体缓慢淡出到黑
  screen.style.transition = 'opacity 1.6s ease'
  void screen.offsetWidth // 强制重排，使 transition 立即生效
  screen.style.opacity = '0'

  // 5) 淡出结束后回执主进程关窗；transitionend 兜底（未触发时 setTimeout 强关）
  let done = false
  const finish = () => {
    if (done) return
    done = true
    try { window.eDEX.shutdown() } catch (_) {}
  }
  screen.addEventListener('transitionend', finish, { once: true })
  setTimeout(finish, 2200)
}
