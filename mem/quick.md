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
- `src/update-log.html` + `src/update-log.css` + `src/update-log.js`：独立更新日志窗口，当前是主程序同款无边框、自绘关闭按钮、始终置顶、固定宽度方案；自适应高度以 `.window-frame` 为基准，视觉上为纯边框卡片，无额外投影阴影。
- `updater-beta.json`：beta 分支专用更新元数据模板；beta 客户端应指向它，不走正式 `updater.json`。

## 改动入口速查

- 改登录/注销/联网检测：看 `src-tauri/src/services/portal.rs`
- 改配置和开机自启：看 `src-tauri/src/services/config.rs`
- 改 Tauri 托盘、窗口、启动流程：看 `src-tauri/src/app.rs`
- 主窗口显示位置统一在 `src-tauri/src/app.rs` 的 `reveal_main_window()` 控制，当前会先 `center()` 再显示
- 改前端调用的命令名或参数：看 `src-tauri/src/commands.rs`
- 自动更新检查的重试、互联网可达性判断与新版本通知入口：看 `src/renderer.js` 的 `checkUpdateOnConnect()`，以及 `src-tauri/src/commands.rs` / `src-tauri/src/services/system.rs` 里的 `check_internet_access()`、`notify_update_available()`
- 改设置页里的高级设置和地址输入：看 `src/index.html` + `src/renderer.js`
- 改正式通道更新日志窗口：看 `src/update-log.html`、`src/update-log.css`、`src/update-log.js`，主入口在 `src/renderer.js` 的 `openUpdateLogWindow()`；设置页“检查更新”按钮现在只负责进入这条流程
- 主分支如果要改“安装测试版”入口：看 `src/index.html` 里的 `installBetaBtn`、`src/renderer.js` 里的 `openBetaInstaller()`，以及 `src-tauri/src/commands.rs` / `src-tauri/src/services/system.rs` 里的 `install_beta_update()`

## 当前提醒

- `services/portal.rs` 仍然偏重，后续可以继续拆成 API 请求层和登录流程层。
- 默认校园网接口地址仍然在 Rust 后端兜底，但现在可由设置页里的 `portalAddress` 覆盖。
- 自定义 `portalAddress` 如果带端口，`src-tauri/src/services/portal.rs` 里的状态检测也会使用同一端口；若以后再改地址解析，别只修登录/注销接口。
- 本地配置仍然明文保存密码。
- 更新日志窗口现在不可拉伸，按自然内容高度优先适配；如果内容过长超出屏幕，再退化为说明区内部滚动，但底部按钮必须始终可见。
- 更新日志窗口的高度上限已改为参考屏幕可用高度，不再吃初始 `360px` 窗口高；若再次出现裁边，优先检查 `src/update-log.css` 的 `.window-frame` 和 `src/update-log.js` 的 `autoFitWindow()`。
- 更新日志子窗口已禁用右键和文本选择；相关入口在 `src/update-log.css` 和 `src/update-log.js`。
- 更新日志子窗口底部按钮已接入更新流程：有新版本时直接“立即更新”，内部调用 `install_update`，完成后自动 `restart_app`；无新版本时仍然只是关闭窗口。
- `commands.rs` 里的 `config_value` 参数在前端必须传成 `configValue`；当前登录和保存配置都已按这个名字修正，若再见到 `missing required key configValue`，优先检查 `src/renderer.js`。
- 当前 `master` 已合并 `beta` 的更新能力与测试通道支持；正式客户端版本是 `1.20.4`，但仍保留设置页“安装测试版”入口。
- 正式客户端 updater endpoint 仍指向 `raw/master/updater.json`，不会误连 beta 通道。
- `updater-beta.json`、`beta-assets/` 和 `scripts/publish-beta.ps1` 现在也在 `master`，供测试版发包继续复用。
- `updater.json` 仍是上一次正式发版 `1.20.3` 的签名元数据；若要真正发布 `1.20.4` 正式更新，需要在构建签名后再同步它。
