<p align="center">
  <br>
  <img alt="Logo" src="media/logo.png" width="128">
  <br>
</p>

<h1 align="center">eDEX-UI-Plus</h1>

<p align="center">
  <strong>科幻风格桌面终端模拟器</strong><br>
  全屏终端监控界面，兼具赛博朋克观感与实用功能
</p>

<p align="center">
  <a href="https://github.com/tianlingmc/edex-ui-plus/releases"><img alt="Version" src="https://img.shields.io/badge/版本-v1.0.0-00d8ff?style=flat-square"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/许可-GPLv3-00d8ff?style=flat-square"></a>
  <a href="https://github.com/tianlingmc/edex-ui-plus/releases"><img alt="Downloads" src="https://img.shields.io/badge/下载-安装包-00d8ff?style=flat-square"></a>
  <a href="https://github.com/GitSquared/edex-ui"><img alt="Based on" src="https://img.shields.io/badge/基于-eDEX--UI-00d8ff?style=flat-square"></a>
</p>

<br>

---

<br>

> **eDEX-UI-Plus** 是基于 [eDEX-UI](https://github.com/GitSquared/edex-ui) (GPL-3.0) 的二次开发项目。  
> 保留原版科幻终端界面的全部视觉基因，将底层技术栈全面现代化，修复时效性缺陷，并改进日常使用体验。

---

## 一览

| 类别 | 特性 |
|------|------|
| 终端 | 多标签页、拖拽排序、Shell 选择、关闭确认、curses 支持 |
| 监控 | 实时 CPU / 内存 / 进程 / 网络 (GeoIP) / 磁盘空间 |
| 文件 | 跟随 CWD 自动切换、磁盘列表、右键菜单、空间条 |
| 主题 | 21 套科幻主题 + CSS 注入 + 自定义键盘布局 |
| 音效 | 科幻风格按键音、启动音、音量/放大可调 |
| 阅读器 | PDF / Markdown / 图片内联预览 |
| 更多 | WebGL 互动地球、内置媒体播放器、Ping 连通检测 |

---

## 功能特性

### 终端
- 最多 6 个独立终端标签页，支持拖拽排序与独立关闭
- 新建终端时弹出 Shell 选择列表（cmd / PowerShell / WSL / git-bash 等）
- 关闭时确认提示，避免误操作
- 支持 256 色、鼠标事件、curses/TUI 应用（neofetch、htop、vim 等）
- 可配置字体大小、光标样式/闪烁、回滚行数、行高、字间距

### 系统监控
- CPU 使用率（多核仪表盘 + 历史曲线）
- 内存与交换分区实时图表
- 进程列表（PID / CPU / 内存 / 用户）
- 网络连接监控 — GeoIP 定位、活跃 TCP 连接、上下行速率
- 磁盘空间使用率（所有挂载点）

### 文件浏览器
- 自动跟随终端工作目录（`cwd`）
- "Show disks" 显示所有磁盘和挂载点
- 右键菜单（复制路径、在新终端打开、属性等）
- 目录空间使用率进度条
- 列表 / 图标视图切换，可选隐藏点文件

### 界面定制
- **21 套主题** — tron、cyborg、matrix、nord、blade、interstellar …
- **19 种键盘布局** — 含 Dvorak、Colemak、Workman、BÉPO 等
- CSS 注入 — 自由修改任意组件样式
- 科幻音效（按键声、启动动画声、错误提示声），音量与放大倍数可调
- 时钟 12/24 小时制切换
- 入场动画速度调节

### 设置与配置
- 图形化设置页面，左侧分类导航
- 一键恢复默认配置
- 配置热重载 — 修改保存后立即生效，无需重启
- 简体中文配置说明（配置键名保留英文，描述汉化）
- 终端行为配置：新建时弹出 Shell 选择、默认终端类型、关闭时确认

---

## 下载安装

从 [Releases](https://github.com/tianlingmc/edex-ui-plus/releases) 页面下载最新安装包。

| 文件 | 说明 |
|------|------|
| `eDEX-UI-Plus Setup *.exe` | NSIS 安装程序（推荐），支持选择安装目录、创建快捷方式 |
| `win-unpacked/` | 便携版，解压即用，无需安装 |

> 安装程序未经代码签名，Windows SmartScreen 会弹出警告，点击"仍要运行"即可。

### 从源码构建

**环境要求：** Node.js >= 22, npm >= 10, Windows x64

```bash
git clone https://github.com/tianlingmc/edex-ui-plus.git
cd edex-ui-plus/src
npm install
npm run dev      # 启动开发模式（热更新）
npm run dist     # 打包为安装程序
npm test         # 运行测试
```

---

## 技术栈

| 组件 | 版本 | 用途 |
|------|------|------|
| [Electron](https://www.electronjs.org/) | 43 | 桌面应用框架 |
| [Vite](https://vitejs.dev/) / [electron-vite](https://electron-vite.org/) | 7 / 5 | 构建工具链 |
| [xterm.js](https://xtermjs.org/) | 6 | 终端模拟器核心 |
| [node-pty](https://github.com/microsoft/node-pty) | 1 | 伪终端 (conpty / WinPTY) |
| [PDF.js](https://mozilla.github.io/pdf.js/) | 4 | 文档阅读器 |
| [Howler.js](https://howlerjs.com/) | 2 | 音效引擎 |
| [systeminformation](https://systeminformation.io/) | 5 | 系统硬件信息 |
| [maxmind](https://www.npmjs.com/package/maxmind) / [GeoLite2](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data) | - | IP 地理定位 |
| [electron-builder](https://www.electron.build/) | 26 | 打包 / NSIS 安装程序 |

---

## 许可

[**GNU General Public License v3.0**](./LICENSE)

本项目基于 [eDEX-UI](https://github.com/GitSquared/edex-ui) (原作者 Gabriel 'Squared' SAILLARD, 2021) 二次开发。

- 完整许可文本： [LICENSE](./LICENSE)
- 署名与第三方资源许可： [NOTICE](./NOTICE.md)
- 原项目： <https://github.com/GitSquared/edex-ui>

> 保留原版全部版权。本项目所有修改与附加代码同样以 GPL-3.0 许可发布。
