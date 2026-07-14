import { contextBridge, ipcRenderer } from 'electron'

// 安全桥：只暴露白名单 API 给渲染端，渲染进程不直接 require / 不接触 Node
console.log('[preload] executing, platform=', process.platform)
contextBridge.exposeInMainWorld('eDEX', {
  platform: process.platform,
  // 系统监控代理：method 为 systeminformation 的方法名，剩余参数透传
  si: (method, ...args) => ipcRenderer.invoke('si', method, args),
  // 遥测订阅：主进程每 1s 批量广播一次系统数据，渲染端一次性收齐所有模块所需
  onTelemetry: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('telemetry', handler)
    return () => ipcRenderer.removeListener('telemetry', handler)
  },
  // 文件系统代理：读目录 + 取 home 路径 + 读单个文件 + 磁盘空间/设备列表/资源管理器打开
  fsReadDir: (dirPath) => ipcRenderer.invoke('fs-readDir', dirPath),
  fsGetHome: () => ipcRenderer.invoke('fs-getHome'),
  fsReadFile: (filePath) => ipcRenderer.invoke('fsReadFile', filePath),
  fsGetSpace: (dirPath) => ipcRenderer.invoke('fs-space', dirPath),
  fsListDrives: () => ipcRenderer.invoke('fs-listDrives'),
  fsOpenInExplorer: (filePath, isDir) => ipcRenderer.invoke('fs-openInExplorer', filePath, isDir),
  // 更新检查 / 打开外部链接 / 版本号
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  geoipLookup: () => ipcRenderer.invoke('geoip-lookup'),
  // 设置 / 重启
  readSettings: () => ipcRenderer.invoke('settings-read'),
  writeSettings: (data) => ipcRenderer.invoke('settings-write', data),
  restartApp: () => ipcRenderer.invoke('app-restart'),
  quitApp: () => ipcRenderer.invoke('app-quit'),
  // Shell 检测
  getAvailableShells: () => ipcRenderer.invoke('get-available-shells')
})
