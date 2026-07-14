# 增量 PRD —— 检查更新流程增强（settings-update-v2）

| 项 | 内容 |
| --- | --- |
| 文档类型 | 增量 PRD（简单版） |
| 项目 | eDEX-UI-Plus（eDEX-UI GPL-3.0 二次开发 fork） |
| 当前版本 | v1.1.0（取自 `package.json` `version`，主进程 `app.getVersion()` 读取） |
| 主开发目录 | `F:\Code\eDEX-UI\src\` |
| 技术栈 | Electron + electron-vite + electron-updater；渲染进程 i18n 基于 `renderer/locale.js` 的 `t(key)` + `window.__edexSettings.language`（`zh`/`en`） |
| 涉及文件 | `renderer/modules/settingsEditor.js`、`main/index.js`、`preload/index.js`、`renderer/locale.js`、`renderer/languages/zh.json`、`renderer/languages/en.json`、`package.json` |
| 文档语言 | 简体中文 |
| 作者 | 产品经理（许清楚） |

---

## 1. 项目信息

### 1.1 原始需求复述（用户原话拆解）

1. 设置页「检查更新」按钮支持双语（中文 + 英文）。
2. 程序**启动时**主动获取最新版本号，与本地版本号对比；若本地版本过低（过期），**弹窗提示**用户有更新。
3. 用户**确认更新开始后**，更新窗口（弹窗）**无法关闭**，必须等到更新流程完成。
4. 下载更新包过程中**显示进度条**。
5. 点击设置页「检查更新」按钮，走与**启动检测完全相同**的更新逻辑。
6. 下载完更新包后，**询问用户是否安装更新**（不再自动静默安装）。
7. 用户确认安装、更新完成后，**自动重启**程序。

### 1.2 现状基线（v1.1.0 已实现的「检查更新」）

- **渲染进程** `settingsEditor.js`：顶栏显示 `eDEX-UI-Plus v1.1.0`；侧边栏 `#se-update-btn` 按钮（文案当前写死 `_check_update_ || '检查更新'`，但 `zh.json`/`en.json` 中**并无该 key**，实为硬编码回退）。点击弹出更新卡片弹窗（`renderUpdateModal`），通过 `onUpdateEvent` 接收主进程 `update-event` 渲染进度；下载完成调用 `showUpdateReadyAndRestart()` 后 **400ms 自动 `updateQuitInstall()` 重启**。
- **主进程** `main/index.js`：`setupAutoUpdater(win)` 在 `app.isPackaged` 时启用 electron-updater（`autoDownload=true`、`autoInstallOnAppQuit=true`），绑定 checking / update-available / update-not-available / download-progress / update-downloaded / error 六事件，经 `sendUpdateEvent` 推送；IPC：`get-app-version`、`update-check`、`update-quit-install`；**启动即静默 `checkForUpdates()`**。
- **preload** `eDEX` 暴露 `getAppVersion` / `updateCheck` / `updateQuitInstall` / `onUpdateEvent`（返回退订函数）。
- **package.json** `build.publish` 已配 `provider:"github", owner:"tianlingmc", repo:"edex-ui-plus"`。

> 关键差异：当前是「后台静默下载 → 下载完自动重启」；新需求是「启动/手动检查 → 弹窗询问/通知 → 用户确认后下载 → 进度条 → 下载完询问安装 → 确认后安装并重启」。需要**移除自动静默安装路径**，并新增**启动弹窗**与**不可关闭约束**。

---

## 2. 产品定义

### 2.1 产品目标（Product Goals）

- **G1（透明可控）**：让用户在任何时刻清楚「是否有更新、更新进度如何、是否要安装」，更新决策权始终在用户手中，杜绝静默安装。
- **G2（双语一致）**：所有更新相关 UI（按钮、弹窗、提示、进度）跟随程序语言设置（中文/英文）正确显示，不再出现硬编码中文回退。
- **G3（统一可靠）**：启动检测与手动检测共用同一套状态机与同一弹窗组件，行为一致、状态不泄漏、异常可降级。

### 2.2 用户故事（User Stories）

- **US1（普通用户 / 老王）**：作为一名使用中文界面、网络偶尔不稳定的用户，我希望打开程序时它能自动告诉我「有新版本」，这样我不用主动去查也能保持最新。
- **US2（双语用户 / Lily）**：作为一名把界面切到 English 的用户，我希望「检查更新」按钮和所有更新提示都显示英文，这样不会因为中文硬编码而困惑。
- **US3（谨慎用户 / 小张）**：作为一名担心后台偷偷改程序的用户，我希望更新弹窗在我没点「确认」之前不能关掉、并且下载时要看到进度条，这样我能确认它在正常进行、且不会在我不知情时重启。
- **US4（手动检查用户 / 老李）**：作为一名点设置页「检查更新」的用户，我希望它和启动时检测到的结果是同一套逻辑，这样我手动检查到的版本号和开机提示的版本号不会不一致。
- **US5（安装决策者 / 老王）**：作为一名下载完更新的用户，我希望程序问我「现在安装吗？」而不是直接重启，这样我能在方便的时候（比如关掉手头终端任务后）再装。

---

## 3. 技术规范

### 3.1 需求池（Requirements Pool）

优先级：**P0 必须有 / P1 应该有 / P2 可后续**。

| 编号 | 需求 | 优先级 | 对应原需求 | 当前 vs 目标 |
| --- | --- | --- | --- | --- |
| R1 | 「检查更新」按钮文案通过 `t(key)` 跟随程序语言切换；`zh.json`/`en.json` 补齐 `check_update` 及全部更新相关 key | **P0** | 1 | 当前 key 缺失、写死中文；目标：双语随设置切换 |
| R2 | 程序启动后主动拉取最新版本号并与本地 `app.getVersion()` 对比（基于 semver） | **P0** | 2 | 当前仅静默 `checkForUpdates()`；目标：取出 latest 版本号做本地对比并触发过期判断 |
| R3 | 若本地版本低于线上版本，弹出「发现新版本」提示（含当前/最新版本号 + 「稍后」「更新」按钮） | **P0** | 2 | 新增启动弹窗（独立于设置页） |
| R4 | 用户点击「更新/下载」确认后，更新弹窗进入**不可关闭**状态，直到流程结束（下载完成 + 用户确认安装 + 重启） | **P0** | 3 | 当前 `✕` 可关、`ESC` 可关；目标：流程中禁用关闭 |
| R5 | 下载过程中弹窗显示**进度条 + 百分比** | **P0** | 4 | 已有 progress 字段，需补全进度条 UI 与文案 |
| R6 | 设置页「检查更新」与启动检测共用**同一状态机/同一弹窗组件**，逻辑完全一致 | **P0** | 5 | 当前启动检测走后台事件、按钮走 `updateCheck()`，需收敛为统一入口 |
| R7 | 下载完成后**弹窗询问是否安装**，不再自动静默安装/重启 | **P0** | 6 | 当前 `showUpdateReadyAndRestart()` 400ms 自动重启；目标：移除该路径，改为询问 |
| R8 | 用户确认安装且更新完成后，**自动重启**（`updateQuitInstall()`） | **P0** | 7 | 保留重启动作，但仅在用户确认安装后触发 |
| R9 | 网络失败/超时时**优雅降级**：启动检测失败静默忽略；手动检查失败弹窗提示「无法连接更新服务器」 | **P1** | — | 当前 `offline` 状态已有雏形；目标：启动 vs 手动区分表现 |
| R10 | 抽取独立的 `openUpdateModal(state)` / 状态机，启动弹窗与设置弹窗复用同一组件 | **P1** | — | 当前弹窗绑定 `#settings-page`；目标：独立 overlay，设置页关闭时也能弹 |
| R11 | 可配置更新源（CDN 镜像 / 自定义 URL），以规避 GitHub 国内不可达 | **P2** | — | 当前固定 `github` provider；目标：支持 `build.publish` 之外的可选镜像源 |

### 3.2 UI 设计稿要点（UI Design Draft）

**A. 统一更新状态机（建议）**

```
idle ──check──▶ checking ──uptodate──▶ (提示"已是最新", 可关)
   ▲                  │
   │                  └──error/offline──▶ (提示"无法连接", 可关)
   │
   └── check 发现过期 ──▶ update-available (弹窗: 当前X / 最新Y / [稍后][更新])
                                        │ 用户点[更新]
                                        ▼
                                  downloading (进度条 N%｜不可关闭)
                                        │ 下载完
                                        ▼
                                  downloaded (弹窗: "下载完成，是否安装？" / [稍后][立即安装]｜不可关闭)
                                        │ 用户点[立即安装]
                                        ▼
                                  installing ("正在安装…"｜不可关闭)
                                        │ 完成
                                        ▼
                                  quitAndInstall() ──▶ 自动重启
```

**B. 按钮（设置页侧边栏 `#se-update-btn`）**

- 文案：`t('check_update')`，双语随 `window.__edexSettings.language` 切换。
- 仅当 `zh.json`/`en.json` 同时具备该 key 时才生效（修复当前 key 缺失导致写死中文的 bug）。
- 风格沿用现有 `.se_update_btn`（科幻描边按钮），不做结构性改动。

**C. 更新弹窗（独立 overlay，建议 ID `#edex-update-modal`）**

- 独立于 `#settings-page`，挂载到 `document.body`，使**启动弹窗在设置页未打开时也能显示**（满足 R3、R10）。
- 结构：`标题栏（文案随语言） + 当前版本 + 最新版本 + 主体区（提示/进度条/按钮）`。
- **不可关闭约束（R4）**：当状态为 `downloading` / `downloaded` / `installing` 时：
  - 隐藏或 `disabled` 右上角 `✕` 关闭按钮；
  - 屏蔽 `ESC` 关闭（与设置页全屏 ESC 关闭逻辑解耦，弹窗存在期间拦截 ESC）。
- **进度条（R5）**：`<div class="bar"><i style="width:N%"></i></div>` + 文案 `t('update_downloading') + N%`，复用现有 `.bar` 样式。
- 文案全部走 `t()`，建议新增 i18n key（见 §3.4）。

**D. 启动 vs 手动的表现差异（R9）**

- 启动检测：超时（建议 8s）/ 失败 → **静默忽略**，不打扰用户（避免每次开机弹错）。可仅在开发者控制台 `console.warn`。
- 手动「检查更新」：失败 → 弹窗显示 `t('update_offline')`（「无法连接更新服务器，请稍后重试」），可关闭。

### 3.3 主进程 / preload 改动要点（供架构师参考）

- `setupAutoUpdater`：保留 `autoDownload=true`（后台下载无妨），但**将 `autoInstallOnAppQuit` 改为 `false`**，并**移除下载完成即 `quitAndInstall`/自动重启的逻辑**；安装仅由渲染进程在用户确认后显式调用 `updateQuitInstall()`。
- 启动检测：保留静默 `checkForUpdates()`；在 `update-available` 事件中取出 `version`，与 `app.getVersion()` 经 semver 比较，过期则经 `sendUpdateEvent({type:'startup-update-available', version})` 推给渲染进程用于弹窗（R2/R3）。
- `update-check` IPC：dev 环境走 GitHub Releases API 比对（现有逻辑），打包环境走 electron-updater；返回 `{status, current, latest, progress, downloaded}` 供统一状态机消费（R6）。
- preload `eDEX.onUpdateEvent` 退订函数需确保每次打开/关闭设置页、或启动弹窗关闭时正确退订，避免监听器泄漏（现有 `_updateUnsub` 机制保留）。

### 3.4 建议新增 i18n Key（双语实现 R1，需同时写入 `zh.json` 与 `en.json`）

| Key | 中文（zh） | 英文（en） |
| --- | --- | --- |
| `check_update` | 检查更新 | Check for Updates |
| `update_found` | 发现新版本 | New version available |
| `update_current` | 当前版本 | Current |
| `update_latest` | 最新版本 | Latest |
| `update_now` | 更新 | Update |
| `update_later` | 稍后 | Later |
| `update_downloading` | 正在下载更新 | Downloading update |
| `update_downloaded` | 更新已下载完成 | Update downloaded |
| `update_install_prompt` | 下载完成，是否立即安装？ | Download complete. Install now? |
| `update_install_now` | 立即安装并重启 | Install & Restart |
| `update_installing` | 正在安装更新… | Installing update… |
| `update_uptodate` | 已是最新版本 | You're up to date |
| `update_offline` | 无法连接更新服务器，请稍后重试 | Can't reach update server. Try later |
| `update_error` | 检查更新失败 | Update check failed |

> 注：当前 `settingsEditor.js` 已引用 `t('check_update')`，但该 key 在两个语言文件中均缺失，属**既有缺陷**，本 PRD 一并修复。

### 3.5 待确认问题（Open Questions）

- **Q1「双语」含义（影响 R1 实现）**
  - *候选方案 A（推荐）*：按钮及所有更新 UI 文案**跟随程序语言设置切换**（中文界面显示中文、英文界面显示英文），复用现有 `t()` + `window.__edexSettings.language` 机制，把缺失 key 补齐到 `zh.json`/`en.json`。理由：与项目既有 i18n 架构一致、改动最小、保持科幻 UI 简洁。
  - *候选方案 B*：按钮**同时显示**两种语言（如「检查更新 / Check for Updates」）。理由：一眼可见双语。但会撑宽侧边栏、破坏极简科幻风、且与现有「按设置切换语言」的设计哲学冲突，**不推荐**。
  - **建议**：采用方案 A。请架构师核查 `locale.js` 后最终确认（PRD 先给推荐）。

- **Q2 启动检测网络失败表现（影响 R9）**
  - 启动检测（GitHub 国内常不稳定）超时/失败时应：① **静默忽略**（推荐，不打扰）还是 ② 弹窗提示「无法连接更新服务器」？
  - **建议**：① 静默忽略（仅 `console.warn`）；手动点击「检查更新」才显式提示失败。避免每次开机因网络抖动弹错。

- **Q3 启动弹窗与设置按钮弹窗是否同一组件（影响 R6/R10）**
  - 启动弹窗需在**设置页可能未打开**时弹出，而现有弹窗绑定在 `#settings-page` 内。
  - **建议**：抽取**单一独立弹窗组件** `openUpdateModal(state)`（overlay 挂 `document.body`），启动检测与设置页按钮**共用同一状态机与同一组件**。两者不是两套 UI，而是同一组件的两次调用（一次由启动事件触发、一次由按钮触发）。

- **Q4 启动「过期弹窗」的默认动作**
  - 弹窗出现后，用户点「稍后」是否彻底忽略本次启动的检测（不再打扰）？是否在本次会话内再次静默重试？**建议**：点「稍后」即关闭本次弹窗、本次启动不再提示；下次启动重新检测。

- **Q5 semver 比较与「预发布/频道」**
  - 是否需要区分 stable / beta 频道？当前仅 GitHub Releases latest。**建议**：v1.1.x 阶段只比对 latest 的 semver，不做频道区分（可纳入 P2 后续）。

---

## 4. 验收要点（Acceptance Notes）

- [ ] 中文 / 英文界面下，「检查更新」按钮及全部更新弹窗文案均正确显示对应语言，无硬编码中文回退（R1）。
- [ ] 启动后若线上版本 > 本地版本，弹出「发现新版本」提示（R2/R3）。
- [ ] 用户确认更新后，弹窗在下载/询问安装/安装期间不可关闭（✕ 与 ESC 均失效）（R4）。
- [ ] 下载全程显示进度条与百分比（R5）。
- [ ] 设置页「检查更新」与启动检测行为、版本号、状态完全一致（R6）。
- [ ] 下载完成后**询问**安装，不再自动静默安装/重启（R7）。
- [ ] 用户确认安装且完成后自动重启（R8）。
- [ ] 启动检测网络失败时静默忽略；手动检查失败给出可关闭的失败提示（R9）。
