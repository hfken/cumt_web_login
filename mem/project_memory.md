# 项目记忆

补充：如果只想先快速进入项目，不想读完整摘要，先看 `mem/quick.md`。

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
- `src-tauri/`
  - `src/main.rs`：后端全部核心逻辑，项目最重要文件。
  - `Cargo.toml`：Rust 依赖与版本。
  - `tauri.conf.json`：窗口、托盘、打包、updater 配置。
  - `build.rs`：标准 `tauri_build::build()`。
- `assets/`：README 用的界面截图，不参与运行时逻辑。
- `icons/` 和 `src-tauri/icons/`：应用图标。
- `updater.json`：热更新元数据示例。
- `mem/`：用于保存项目记忆。

## 前端职责

- `renderer.js` 负责：
  - 初始化 DOM 引用、绑定全部按钮事件。
  - 加载并保存本地配置。
  - 登录、注销、联网检测。
  - 自动心跳轮询断线检测。
  - 托盘唤起后重新同步连接状态。
  - 更新检查、安装更新、重启应用。
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

## 后端职责

- `main.rs` 把所有逻辑都放在一个文件里，没有再拆模块。
- `Config` 字段：
  - `student_id`
  - `password`
  - `operator`
  - `auto_login`
  - `check_interval`
  - `auto_check`
- `get_config_path()` 优先使用 `directories::ProjectDirs` 的数据目录，回退到当前目录下 `config.json`。
- `save_config()` 除了写配置，还会修改 Windows 注册表：
  - 路径：`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
  - 键名：`CampusNetworkAutoLogin`
  - 启动参数：`"当前 exe 路径" --hidden`
- `check_connection()` 请求校园网状态接口：
  - `http://10.2.5.251/drcom/chkstatus?...`
  - 解析 JSONP 返回值，提取在线状态、UID、IP。
- `do_login()` 请求认证接口：
  - `http://10.2.5.251:801/eportal/?c=Portal&a=login...`
  - 若当前已有其他账号在线且 `force=false`，返回 `needs_confirm=true`，前端展示顶号确认。
  - 若 `force=true`，会先执行 `do_logout()` 再登录。
- `do_logout()` 请求注销接口：
  - `http://10.2.5.251:801/eportal/?c=Portal&a=logout...`
- `notify_drop()` 通过系统通知提示断线。
- 更新相关：
  - `check_for_updates()` 使用 Tauri updater 检查版本。
  - `install_update()` 下载并安装更新。
  - `restart_app()` 重启应用。

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
- 真实产品版本以 `src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 为准，当前二者一致为 `1.20.2`。
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
  - 检查更新 / 一键更新
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

## 容易踩坑的点

- 当前 Rust 逻辑全部堆在 `src-tauri/src/main.rs`，后续改动容易产生耦合。
- `Config` 存明文密码，属于本地明文持久化方案。
- `check_connection()`、登录、注销接口都直接写死到校园网 IP，迁移性弱。
- 前端按钮文案与初始化状态较多，改 UI 时要留意状态切换是否互相覆盖。
- 版本号同时出现在 `package.json`、`Cargo.toml`、`tauri.conf.json`、`updater.json`，发布时容易不一致。
- README 描述的部分能力都来自 `main.rs` 单文件实现，排查问题优先看那里。

## 后续协作时的最快入口

- 改界面：先看 `src/index.html` + `src/styles.css` + `src/renderer.js`
- 改登录/注销/检测：先看 `src-tauri/src/main.rs`
- 改窗口/托盘/更新/打包：先看 `src-tauri/tauri.conf.json`
- 改版本/发版：同时检查 `src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`updater.json`
