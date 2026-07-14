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

## 构建与运行（待阶段 1 补全）

```bash
npm install
npm run dev      # 开发模式
npm run build    # 打包发行
```

> 注：以上脚本将在工程骨架建成后可用。当前阶段仅完成许可与改名合规文件。

## 功能特性（继承自原版）

- 全功能终端模拟器（标签页、颜色、鼠标事件、curses 支持）。
- 实时系统（CPU/内存/进程）与网络（GeoIP、活跃连接、速率）监控。
- 触控屏支持，含屏幕键盘。
- 跟随终端 CWD 的目录浏览器。
- 通过主题、键盘布局、CSS 注入深度定制。
- 可选科幻音效。

## 状态

- 阶段 0：许可合规与改名（进行中）。
- 后续阶段：现代化工程骨架、模块迁移、汉化与缺陷修复、打包发布。
