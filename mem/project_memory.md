# 项目记忆

补充：如果只想先快速进入项目，不想读完整摘要，先看 `mem/quick.md`。

## 协作约定

- 每次修改代码、配置、文档或项目结构后，必须同步更新 `mem/project_memory.md`，必要时同时更新 `mem/quick.md`。
- 如果只是很小的局部改动，`quick.md` 可以只补最快入口和最新变更，不必重复完整背景。

## 项目定位

- 项目是一个面向中国矿业大学校园网认证的 Windows 桌面客户端。
- 技术栈是 `Tauri 1.x + Rust + 原生 HTML/CSS/JavaScript`，没有使用 React/Vue。
- 前端静态资源直接放在 `src/`，Tauri `devPath` 和 `distDir` 都指向 `../src`。
- 应用主窗口是透明、无边框、固定尺寸窗口，默认最小化到系统托盘而不是直接退出。

## 根目录结构

- `src/`
  - `index.html`：唯一页面，包含登录页、成功页、设置页、顶号确认层、更新横幅。
  - `renderer.js`：前端全部交互逻辑，通过 `window.__TAURI__.tauri.invoke` 调 Rust 命令。
  - `styles.css`：整套界面样式，主色是 taupe 系暖灰，成功态和更新横幅有单独视觉效果。
  - `update-log.html` / `update-log.css` / `update-log.js`：独立的更新日志窗口页面，用于单独展示版本说明，样式与主程序保持一致。
- `src-tauri/`
  - `src/main.rs`：现在只保留后端入口，调用 `app::run()`。
  - `src/app.rs`：Tauri 应用入口、单实例、系统托盘、窗口生命周期。
  - `src/commands.rs`：统一暴露给前端的 Tauri commands。
  - `src/models.rs`：共享数据结构，如 `Config`、`StatusResult`、`LoginResult`、`UpdateInfo`。
  - `src/services/config.rs`：配置读写、配置路径、Windows 开机自启注册表同步。
  - `src/services/portal.rs`：校园网状态检测、登录、注销、JSONP 解析、请求拼装。
  - `src/services/system.rs`：系统通知、更新检查、安装更新、应用重启。
  - `src/services/mod.rs`：服务模块声明。
  - `Cargo.toml`：Rust 依赖与版本。
  - `tauri.conf.json`：窗口、托盘、打包、updater 配置。
  - `build.rs`：标准 `tauri_build::build()`。
- `assets/`：README 用的界面截图，不参与运行时逻辑。
- `icons/` 和 `src-tauri/icons/`：应用图标。
- `updater.json`：热更新元数据示例。
- `updater-beta.json`：beta 分支专用的热更新元数据模板，供测试更新通道使用。
- `mem/`：用于保存项目记忆。

## 前端职责

- `renderer.js` 负责：
  - 初始化 DOM 引用、绑定全部按钮事件。
  - 加载并保存本地配置。
  - 登录、注销、联网检测。
  - 自动心跳轮询断线检测。
  - 托盘唤起后重新同步连接状态。
  - 更新检查、安装更新、重启应用。
  - 打开独立的更新日志窗口。
  - 顶号确认弹层流程。
- 前端通过以下 Tauri commands 与 Rust 交互：
  - `get_config`
  - `save_config`
  - `check_connection`
  - `do_login`
  - `do_logout`
  - `notify_drop`
  - `check_for_updates`
  - `install_update`
  - `restart_app`
- `commands.rs` 里的 `save_config(config_value: ...)` 和 `do_login(config_value: ..., force: ...)` 在前端 `invoke` 时要传 `configValue`，不能继续传旧的 `config`，否则会报 `missing required key configValue`。

## 后端职责

- 后端已从单文件重构为“入口 + 命令层 + 服务层 + 模型层”结构。
- `Config` 字段：
  - `student_id`
  - `password`
  - `operator`
  - `portal_address`
  - `auto_login`
  - `check_interval`
  - `auto_check`
- `models.rs` 里给 `Config` 增加了 `account()`，统一拼接运营商后缀账号。
- `services/config.rs` 中：
  - `get_config_path()` 优先使用 `directories::ProjectDirs` 的数据目录，回退到当前目录下 `config.json`。
  - `save_config()` 除了写配置，还会修改 Windows 注册表。
  - 注册表路径：`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
  - 键名：`CampusNetworkAutoLogin`
  - 启动参数：`"当前 exe 路径" --hidden`
- `services/portal.rs` 中：
  - `check_connection()` 请求校园网状态接口：`http://10.2.5.251/drcom/chkstatus?...`
  - 解析 JSONP 返回值，提取在线状态、UID、IP。
  - 会优先读取配置中的 `portal_address`，留空时才回退默认校园网地址。
  - `portal_address` 支持用户输入主机、带协议的地址或显式端口，例如 `10.2.5.251`、`http://10.2.5.251`、`http://10.2.5.251:801`。
  - 若用户在 `portal_address` 里显式填写端口，状态检测 `/drcom/chkstatus` 现在也会跟着使用该端口，不再只把端口用于登录/注销接口。
  - `login()` 请求认证接口：`http://10.2.5.251:801/eportal/?c=Portal&a=login...`
  - 若当前已有其他账号在线且 `force=false`，返回 `needs_confirm=true`，前端展示顶号确认。
  - 若 `force=true`，会先执行 `logout()` 再登录。
  - `logout()` 请求注销接口：`http://10.2.5.251:801/eportal/?c=Portal&a=logout...`
- `services/system.rs` 中：
  - `notify_drop()` 通过系统通知提示断线。
  - `check_for_updates()` 使用 Tauri updater 检查版本。
  - `install_update()` 下载并安装更新。
  - `restart_app()` 重启应用。
- `commands.rs` 只做 Tauri command 暴露和简单转发，不直接承载业务细节。

## Tauri 行为

- 开启了：
  - `system-tray`
  - `api-all`
  - `updater`
- 集成了 `tauri-plugin-single-instance`：
  - 重复启动时会唤起现有窗口并发通知。
- 系统托盘菜单有四项：
  - 显示主界面
  - 静默登录
  - 静默注销
  - 完全退出
- `setup()` 中：
  - 若参数包含 `--hidden`，窗口先隐藏。
  - 且若配置里 `auto_login=true`，会后台强制登录。
  - 否则正常显示窗口。
- `CloseRequested` 被拦截，关闭按钮只隐藏窗口，不退出进程。

## 版本与运行

- `package.json` 很薄，只保留 `tauri` script。
- JS 侧版本是 `1.10`，Rust/Tauri 包版本是 `1.20.2`。
- 真实产品版本以 `src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 为准，当前二者一致为 `1.20.3`。
- `beta` 分支当前已切到测试版通道：`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 版本为 `1.20.4-beta.1`，updater endpoint 指向 `https://gitee.com/huangyaowei2005/cumt_web_login/raw/beta/updater-beta.json`。
- 开发命令：
  - `npm install`
  - `npm run tauri dev`
- 构建命令：
  - `npm run tauri build`

## UI 结构记忆

- 登录页字段：
  - 学号/账号
  - 密码
  - 运营商选择
- 主操作按钮：
  - 检测
  - 注销
  - 登录
- 成功页：
  - 绿色成功图标可直接一键下线。
- 设置页：
  - 开机后台自动登录
  - 自动监控网络状态
  - 检测频率
  - 高级设置中的“校园网登录地址”输入框，留空时使用默认地址
  - 检查更新 / 一键更新
  - 点击“检查更新”后，版本更新日志会在独立新窗口中展示
  - 更新日志窗口是无原生边框、自绘关闭按钮、始终置顶、固定宽度且不可拉伸的紧凑小弹层
  - 更新说明面板底部额外留白，避免说明方框边线贴住窗口边界
  - 更新日志窗口按自然内容高度优先适配；如果内容过长超出屏幕，再退化为说明区内部滚动，但底部按钮始终可见
  - 更新日志窗口的尺寸现在以 `src/update-log.html` 里的 `.window-frame` 为测量基准，避免 `body` 外边距和自绘边框不在同一套高度计算里
  - 更新日志窗口现在不再显示 `.window-frame` 的背景层，只保留内部 `.window-card` 作为单层可视边框；页面内同时禁用了右键菜单和文本选择
  - 更新日志窗口底部确认按钮现在会按更新状态切换：检测到新版本时显示“立即更新”并直接调用 `install_update` + `restart_app`，没新版本时保持“知道了”仅关闭窗口
- 还有两个覆盖层：
  - 顶号确认层
  - 更新横幅/内嵌更新信息块

## 关键调用链

- 应用启动：
  - 前端加载配置 -> 立即 `check_connection` -> 根据结果切换登录页或成功页 -> 启动心跳轮询。
- 用户登录：
  - 前端收集表单 -> `do_login(force=false)` -> 若需要顶号则弹确认层 -> 确认后 `do_login(force=true)`。
- 自动监控：
  - `setInterval(runBackgroundCheck, interval)`。
  - 从在线变离线时触发 `notify_drop()` 并切回登录页。
- 更新流程：
  - 连接成功后会自动调用一次 `check_for_updates()`。
  - 设置页也可手动检查，若发现新版本则按钮变成“一键更新”。
  - 手动检查更新后，版本说明会在独立的更新日志窗口中显示，而不是内嵌在设置页里。
  - 更新日志窗口会按内容自动计算高度，尽量在首次打开时直接显示完整内容，并保持始终置顶。
  - 更新日志窗口高度上限不再参考初始窗口高度，而是参考屏幕可用高度；初始创建高度和最小高度统一为 `420`，减少首次渲染时自绘边框和底部按钮被裁掉的问题。
  - 设置页关闭时不再重置 `checkUpdateBtn.dataset.pendingUpdate`，避免用户已经检测到新版本后，仅仅关闭设置页就丢失“一键更新”状态。

## 容易踩坑的点

- 虽然已经不再是单个 `main.rs`，但 `services/portal.rs` 仍然同时负责请求拼装、响应解析和登录流程控制，后续还可以继续细拆。
- `Config` 存明文密码，属于本地明文持久化方案。
- 默认校园网地址仍然内置在 Rust 后端，只是现在允许用户通过设置页覆盖。
- 前端按钮文案与初始化状态较多，改 UI 时要留意状态切换是否互相覆盖。
- 更新日志窗口依赖 `src/update-log.html` 这一组静态页面；如果后续调整前端目录或 Tauri 资源路径，要一起检查这个窗口是否还能正常打开。
- 更新日志窗口现在是 `decorations: false` + `transparent: true` 的自绘窗口；如果后续改回系统标题栏，`update-log.html` 里的自定义标题栏和关闭按钮也要一起调整。
- 版本号同时出现在 `package.json`、`Cargo.toml`、`tauri.conf.json`、`updater.json`，发布时容易不一致。
- 现在已有正式/测试两条更新线：正式线看 `updater.json`，beta 线看 `updater-beta.json`；发测试更新时不要误改正式 endpoint 或正式元数据。
- 托盘静默登录和启动自动登录现在直接调用 `services::portal::login()`，如果以后要加日志、埋点或统一前后置动作，要优先检查这些入口是否保持一致。

## 后续协作时的最快入口

- 改界面：先看 `src/index.html` + `src/styles.css` + `src/renderer.js`
- 改命令暴露：先看 `src-tauri/src/commands.rs`
- 改登录/注销/检测：先看 `src-tauri/src/services/portal.rs`
- 改配置持久化 / 开机自启：先看 `src-tauri/src/services/config.rs`
- 改窗口/托盘/更新/打包：先看 `src-tauri/src/app.rs` + `src-tauri/src/services/system.rs` + `src-tauri/tauri.conf.json`
- 改版本/发版：同时检查 `src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`updater.json`
