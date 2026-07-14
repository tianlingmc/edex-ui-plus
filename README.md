<p align="center">
  <br>
  <img alt="Logo" src="media/logo.png">
  <br></p>

# eDEX-UI-Plus

**科幻风格桌面终端模拟器** — 全屏终端监控界面，兼具科幻观感与实用功能。

基于 eDEX-UI (GPL-3.0) 二次开发，升级底层技术栈并改进使用体验。

![screenshot](https://github.com/tianlingmc/edex-ui-plus/raw/main/screenshot.png)

## 功能特性

### 终端
- 多标签页终端模拟器（最多 6 个独立终端）
- 标签页支持拖拽排序、独立关闭
- 新建终端时可选 Shell 类型（cmd / PowerShell / WSL 等）
- 关闭终端时确认提示，防止误操作
- 支持颜色、鼠标事件、curses 应用

### 系统监控
- 实时 CPU / 内存 / 进程监控
- 网络连接监控（GeoIP 定位、活跃连接、速率统计）
- 硬盘空间使用情况

### 文件浏览器
- 跟随终端工作目录（CWD）自动切换
- 显示磁盘列表（Show disks）
- 右键菜单（复制路径、打开文件等）
- 目录空间使用率条

### 界面定制
- 21 套科幻风格主题
- 19 种屏幕键盘布局（含 Dvorak、Colemak 等）
- CSS 注入自由修改样式
- 科幻音效（按键音、启动音等）
- 时钟格式（12/24 小时制）
- 入场动画速度调节

### 设置与配置
- 图形化设置页面（左侧分类导航）
- 恢复默认配置一键重置
- 配置热重载 — 修改后无需重启应用
- 简体中文配置说明（配置键名保留英文，描述汉化）
- 终端参数：字体大小、光标样式/闪烁、回滚行数、行高、字间距

### 更多的功能
- PDF / Markdown / 图片文件阅读器
- 内置媒体播放器
- WebGL 3D 互动地球（GeoIP 可视化）
- 网络连通性检测（Ping）

## 安装

### 下载安装包

从 [Releases](https://github.com/tianlingmc/edex-ui-plus/releases) 页面下载最新版本。

Windows 安装程序 (`eDEX-UI-Plus Setup *.exe`) 支持选择安装目录、创建桌面快捷方式。

### 从源码构建

**环境要求：** Node.js >= 22, Windows x64

```
git clone https://github.com/tianlingmc/edex-ui-plus.git
cd edex-ui-plus
cd src
npm install
npm run dev       # 开发模式（热更新）
npm run dist      # 打包为安装程序
npm test          # 运行测试
```

## 技术栈

| 组件 | 版本 |
|------|------|
| Electron | 43 |
| Vite / electron-vite | 7 / 5 |
| xterm.js | 6 (含 addons) |
| node-pty | 1 (conpty / WinPTY) |
| PDF.js | 4 |
| Howler.js | 2 |
| systeminformation | 5 |
| ws (WebSocket) | 8 |
| electron-builder | 26 (NSIS) |

## 许可

**GNU General Public License v3.0**

本项目基于 [eDEX-UI](https://github.com/GitSquared/edex-ui) (原作者 Gabriel 'Squared' SAILLARD) 二次开发，以 GPL-3.0 许可发布。

完整许可文本见 [LICENSE](./LICENSE)，署名与第三方资源许可见 [NOTICE](./NOTICE.md)。

> 保留原版全部版权。本项目的修改和附加代码同样以 GPL-3.0 许可发布。
