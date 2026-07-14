// 更新检查器（原 updateChecker.class.js 的忠实移植，安全架构）
// 原版在启动时静默访问 GitHub API，仅当有新版本可用时弹出一个 info 模态框；没有任何常驻面板。
// 这里复刻同样的行为：启动时调用 checkForUpdates()，有新版本才弹窗，离线/未配置则静默降级。

import { Modal } from './modal.js'
import { esc } from '../ui.js'

export async function checkForUpdates() {
  if (!window.eDEX || typeof window.eDEX.checkUpdate !== 'function') return
  try {
    const r = await window.eDEX.checkUpdate()
    if (r.status === 'update' && r.url) {
      new Modal({
        type: 'custom',
        title: 'New version available',
        html: `<h5>eDEX-UI-Plus <strong>${esc(r.latest || '')}</strong> is now available.<br/>Head over to github.com to download the latest version.</h5>`,
        buttons: [
          { label: 'DOWNLOAD', onClick: () => { try { window.eDEX.openExternal(r.url) } catch (_) {} } },
          { label: 'DISMISS', onClick: () => {} }
        ]
      })
    }
  } catch (_) {
    // 离线或请求失败，与原版一致静默忽略
  }
}
