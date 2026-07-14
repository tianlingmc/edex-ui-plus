import { defineConfig } from 'electron-vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// electron-vite 只打包 rollup 入口，不会自动复制非入口的独立子进程文件。
// telemetry.child.mjs 由 main 进程 fork 运行（out/main/telemetry.child.mjs），必须显式复制到产物目录。
function copyTelemetryChild() {
  return {
    name: 'copy-telemetry-child',
    apply: 'build',
    closeBundle() {
      const src = resolve(__dirname, 'main/telemetry.child.mjs')
      const dst = resolve(__dirname, 'out/main/telemetry.child.mjs')
      if (!existsSync(src)) return
      mkdirSync(dirname(dst), { recursive: true })
      copyFileSync(src, dst)
      console.log('[build] copied telemetry.child.mjs ->', dst)
    }
  }
}

// 本工程根目录即 src/（所有二次开发在此进行），electron-vite 默认的 <root>/src/ 约定不适用，
// 因此显式声明三个进程的入口（路径相对工程根 = src/）。
export default defineConfig({
  main: {
    plugins: [copyTelemetryChild()],
    build: {
      rollupOptions: {
        input: 'main/index.js'
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: 'preload/index.js'
      }
    }
  },
  renderer: {
    // dev 模式下 Vite 会到 root 目录找 index.html；必须显式指向 renderer/，否则会 serve 空白页
    root: 'renderer',
    // 构建产物用相对路径，打包后通过 file:// 加载时资源才能正确解析
    base: './',
    build: {
      rollupOptions: {
        // 注意：build 的 input 是相对工程根 (src/) 解析的，与 main/preload 一致，不能用 'index.html'
        input: 'renderer/index.html'
      }
    },
    // 依赖预扫描应指向真正的 JS 入口（HTML 文件无法被扫描），消除 "failed to resolve rollupOptions.input" 警告
    optimizeDeps: {
      entries: 'renderer/main.js'
    }
  }
})
