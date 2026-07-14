// 遥测中枢：对应原版 _multithread.js 的设计意图，把 systeminformation 扫描完全移到独立子进程。
// 主进程只负责：
//   1. fork 出 telemetry child 进程；
//   2. 收到子进程消息后通过 IPC 广播给渲染端；
//   3. 窗口关闭时停止子进程。

import { fork } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

export class TelemetryHub {
  constructor(win) {
    this.win = win
    this.child = null
  }

  start() {
    if (this.child) return
    const isDev = !!process.env.ELECTRON_RENDERER_URL
    // dev 下 app.getAppPath() 已是工程根（src），telemetry.child.mjs 就在 src/main/ 下；
    // prod 下 electron-vite 已将其复制到 out/main/。两者都做存在性兜底，避免路径错位
    // 导致 fork 目标不存在、子进程 code 1 退出、遥测从不广播。
    let childPath = isDev
      ? join(app.getAppPath(), 'main/telemetry.child.mjs')
      : join(app.getAppPath(), 'out/main/telemetry.child.mjs')
    if (!existsSync(childPath)) {
      const alt = isDev
        ? join(app.getAppPath(), 'out/main/telemetry.child.mjs')
        : join(app.getAppPath(), 'main/telemetry.child.mjs')
      if (existsSync(alt)) childPath = alt
    }

    try {
      this.child = fork(childPath, [], {
        silent: true,
        execArgv: ['--no-warnings']
      })
      this.child.on('message', (msg) => {
        if (msg && msg.type === 'telemetry' && this.win && !this.win.isDestroyed()) {
          this.win.webContents.send('telemetry', msg.payload)
        }
      })
      this.child.on('error', (err) => console.error('[telemetry hub] child error:', err.message))
      this.child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.warn('[telemetry hub] child exited with code', code)
        }
      })
      console.log('[telemetry hub] child forked at', childPath)
    } catch (err) {
      console.error('[telemetry hub] fork failed:', err.message)
    }
  }

  stop() {
    if (this.child) {
      try {
        this.child.send({ type: 'stop' })
      } catch (_) { /* ignore */ }
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill('SIGTERM')
        }
      }, 500)
    }
  }
}
