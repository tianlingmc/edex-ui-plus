# eDEX-UI-Plus

> A science fiction desktop running everywhere. Awesome.

**eDEX-UI-Plus 是基于 [eDEX-UI](https://github.com/GitSquared/edex-ui) 的二次开发项目。**

eDEX-UI 由 Gabriel 'Squared' SAILLARD 创作，以 GPL-3.0 许可发布，并于 2021-10-18 归档停更。
本项目的目标是：在保留原版科幻终端观感与全部功能模块的前提下，将底层技术栈现代化
（升级 Electron、采用安全进程模型、升级终端引擎），修复时效性缺陷，并提供简体中文配置说明。

## 许可与署名

- 本软件基于 eDEX-UI 二次开发，原作者保留全部版权。
- 本项目以 **GNU GPL-3.0** 发布（与原项目一致）。
- 完整许可文本见 [LICENSE](./LICENSE)；署名与第三方资源许可见 [NOTICE](./NOTICE.md)。
- 原项目：<https://github.com/GitSquared/edex-ui>

## 与原项目的关系

- 产品名由 eDEX-UI 改为 **eDEX-UI-Plus**，以明确其为衍生版本，不暗示与原作者的官方关联。
- 视觉资产（主题、键盘布局、字体、音效、WebGL 地球）与功能模块在原版基础上迁移。
- 代码以原版为起点进行现代化重构，并非原版的直接打包。

## 功能特性

- 全功能终端模拟器（多标签页、颜色、鼠标事件、curses 支持，最多 6 个终端）。
- 实时系统（CPU/内存/进程）与网络（GeoIP、活跃连接、速率）监控。
- 触控屏支持，含屏幕键盘（19 种布局）。
- 跟随终端 CWD 的目录浏览器（支持 Show disks、右键菜单、空间使用率）。
- 通过主题（21 种）、键盘布局、CSS 注入深度定制。
- 可选科幻音效。
- 配置热重载（修改设置后无需重启应用）。
- 简体中文配置说明（键名保留英文，描述汉化）。
- 终端行为配置：新建时询问类型、默认终端类型、关闭前确认。

## 构建与运行

### 环境要求

- Node.js >= 22
- npm >= 10
- Windows x64（当前版本仅支持 Windows，跨平台支持待后续版本）

### 开发模式

```bash
cd src
npm install
npm run dev
```

### 打包发布

```bash
cd src
npm run dist
```

产物位于 `release/` 目录：
- `eDEX-UI-Plus Setup 1.0.0.exe` — NSIS 安装程序
- `win-unpacked/eDEX-UI-Plus.exe` — 便携版（解压即用）

### 运行测试

```bash
cd src
npm test
```

## 下载

从 [Releases](https://github.com/tianlingmc/edex-ui-plus/releases) 页面下载最新安装包。

## 构建说明

当前版本使用以下技术栈：

| 组件 | 版本 |
|------|------|
| Electron | 43.1.0 |
| Vite / electron-vite | 7.x / 5.x |
| xterm.js | 6.x (@xterm/xterm + addons) |
| node-pty | 1.1.0 (conpty/WinPTY) |
| PDF.js | 4.x |
| Howler.js | 2.x |
| systeminformation | 5.x |
| ws (WebSocket) | 8.x |
| electron-builder | 26.x (NSIS) |
