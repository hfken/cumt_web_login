# 快速入口

## 协作规则

- 每次修改后必须同步更新记忆，至少更新 `mem/project_memory.md`。
- 如果改动会影响最快入口、模块分工或排查路径，同时更新 `mem/quick.md`。

## 当前后端结构

- `src-tauri/src/main.rs`：仅保留入口，调用 `app::run()`。
- `src-tauri/src/app.rs`：Tauri 启动、托盘、窗口生命周期、单实例处理。
- `src-tauri/src/commands.rs`：前端 `invoke` 命令出口。
- `src-tauri/src/models.rs`：共享数据结构。
- `src-tauri/src/services/config.rs`：配置读写、配置路径、注册表自启。
- `src-tauri/src/services/portal.rs`：校园网检测、登录、注销，以及自定义校园网登录地址解析。
- `src-tauri/src/services/system.rs`：通知、更新、重启。

## 改动入口速查

- 改登录/注销/联网检测：看 `src-tauri/src/services/portal.rs`
- 改配置和开机自启：看 `src-tauri/src/services/config.rs`
- 改 Tauri 托盘、窗口、启动流程：看 `src-tauri/src/app.rs`
- 主窗口显示位置统一在 `src-tauri/src/app.rs` 的 `reveal_main_window()` 控制，当前会先 `center()` 再显示
- 改前端调用的命令名或参数：看 `src-tauri/src/commands.rs`
- 改设置页里的高级设置和地址输入：看 `src/index.html` + `src/renderer.js`
- 主分支如果要改“安装测试版”入口：看 `src/index.html` 里的 `installBetaBtn`、`src/renderer.js` 里的 `openBetaInstaller()`，以及 `src-tauri/src/commands.rs` / `src-tauri/src/services/system.rs` 里的 `install_beta_update()`

## 当前提醒

- `services/portal.rs` 仍然偏重，后续可以继续拆成 API 请求层和登录流程层。
- 默认校园网接口地址仍然在 Rust 后端兜底，但现在可由设置页里的 `portalAddress` 覆盖。
- 本地配置仍然明文保存密码。
