# 中国矿业大学校园网自动登录

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Tauri](https://img.shields.io/badge/Tauri-1.5-FFC131?logo=tauri)
![Rust](https://img.shields.io/badge/Rust-Native-black?logo=rust)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows)

面向中国矿业大学校园网的 Windows 桌面自动登录客户端，基于 `Tauri 1.x + Rust + 原生 HTML/CSS/JavaScript` 实现。当前产品版本为 `1.21.1`。

它的目标不是堆复杂功能，而是把“开机后安静驻留、需要时自动连接、掉线后及时提醒、更新时尽量少打扰”这条链路做好。

## 功能概览

- 支持学号 / 密码 / 运营商登录，支持移动、电信、联通和纯校园网接入。
- 支持检测当前在线状态、手动登录、手动注销。
- 检测到已有其他账号在线时，会先提示“顶号确认”，而不是直接强制下线对方。
- 支持 Windows 开机后台自动登录，底层使用计划任务 `CampusNetworkAutoLogin`，启动参数为 `--hidden`。
- 隐藏启动自动登录带短时重试逻辑；网络刚起时会继续重试，但检测到其他账号在线时不会自动顶号。
- 支持后台自动监控网络状态，默认每 `15` 秒检测一次，最小支持 `5` 秒。
- 支持自定义校园网认证地址，兼容 `10.2.5.251`、`http://10.2.5.251`、`http://10.2.5.251:801` 这类输入。
- 校园网检测、登录、注销请求会绕过 Windows 系统代理，减少 Clash 系统代理等场景下的误判。
- 主窗口关闭后默认隐藏到系统托盘，不直接退出进程；托盘支持“显示主界面 / 静默登录 / 静默注销 / 完全退出”。
- 支持单实例运行，重复打开时会唤起已有窗口并给出通知。
- 支持内置更新检查、独立更新日志窗口、正式通道热更新，以及测试版安装器下载。
- 设置页支持还原本地配置，并同步删除开机自启计划任务。

## 界面预览

![登录页](assets/login.png)
![已连接](assets/success.png)
![设置页](assets/setting.png)

## 运行环境

- Windows 10/11
- Node.js 18+
- Rust 工具链
- Visual Studio C++ Build Tools

## 快速开始

### 开发运行

```bash
npm install
npm run tauri dev
```

适合改界面、调交互、验证登录流程。这个阶段不需要 updater 私钥。

前端静态资源直接位于 `src/`，Tauri 的 `devPath` / `distDir` 也都指向这个目录。

### 普通构建

```bash
npm run tauri build
```

构建完成后，安装包和 updater 产物会输出到 `src-tauri/target/release/bundle/nsis/`。

## 构建与密钥说明

- 本地开发运行 `npm run tauri dev` 不需要 updater 密钥。
- 按当前仓库配置直接执行 `npm run tauri build` 时，通常需要提供 updater 私钥和私钥密码，因为打包目标包含 `updater` 签名产物。
- 当前 updater 公钥已经写入 `src-tauri/tauri.conf.json`，一般不需要额外手动提供公钥文件；真正敏感且必须保管好的是私钥和私钥密码。
- 如果只是给自己本地验证功能、并不需要自动更新签名，可以临时移除 `src-tauri/tauri.conf.json` 里的 `updater` 打包目标后再构建测试包。
- 如果要发布正式版或测试版，并保留客户端自动更新能力，则必须使用同一套 updater 私钥签名；否则客户端会因为验签不一致而无法安装更新。
- beta 发布脚本 `scripts/publish-beta.ps1` 也依赖 `TAURI_PRIVATE_KEY` 与 `TAURI_KEY_PASSWORD`，可通过环境变量或脚本引导输入提供。

### 协作者最常见的三种场景

- 只改代码并本地运行：执行 `npm install`、`npm run tauri dev`，不需要密钥。
- 只想本地打一个测试安装包：可以先确认是否保留 `updater` target；若保留，通常仍需要私钥；若只是自测，可临时去掉 `updater` target 后再 `npm run tauri build`。
- 需要产出可分发、可自动更新的正式包或测试包：必须准备好同一套 updater 私钥和密码，并同步更新版本号、签名产物和对应的 `updater*.json`。

## 协作建议

- 接手前先确认版本号是否同时和 `src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`updater.json`、`updater-beta.json` 保持一致。
- 只做界面或逻辑修改时，优先用 `npm run tauri dev` 验证，不必一开始就碰签名和发版流程。
- 若要交付给其他人安装，先确认自己构建出来的是“仅本地测试包”还是“带自动更新能力的正式包”，两者对密钥和元数据要求不同。
- 若要维护测试通道，优先使用 `scripts/publish-beta.ps1`，不要只替换安装包文件而忘记同步 `updater-beta.json`。

## 项目结构

```text
src/
  index.html          主界面与各类覆盖层
  renderer.js         前端交互、状态轮询、更新入口
  styles.css          主窗口样式
  update-log.*        独立更新日志子窗口

src-tauri/
  src/app.rs          Tauri 启动、托盘、窗口生命周期、单实例
  src/commands.rs     前端 invoke 命令出口
  src/models.rs       共享数据结构
  src/services/
    config.rs         配置读写、计划任务自启动同步
    portal.rs         校园网检测、登录、注销
    system.rs         通知、更新、安装、重启

scripts/
  publish-beta.ps1    beta 通道发布辅助脚本
```

## 配置与行为说明

- 本地配置会保存学号、密码、运营商、检测频率、自启动等信息。
- 设置页每次打开都会重新从后端读取配置，避免前端显示与磁盘状态不一致。
- 若已开启开机后台自动登录，但系统里的计划任务缺失、指向旧路径或参数异常，应用会在启动后提示修复。
- 自动更新以“当前是否可以访问互联网”为判断前提，不要求必须先完成校园网认证。
- 正式版默认走 `updater.json`；测试版安装入口会读取 `updater-beta.json` 并拉起外部安装器。

## 已知限制

- 当前重点支持 Windows 桌面端。
- 本地配置中的密码仍为明文保存。
- “绕过代理”当前主要覆盖 Windows 系统代理场景；如果使用的是 Clash TUN 一类网络层接管，校园网请求仍可能失败。
- `updater.json` 与 `updater-beta.json` 需要在实际发版时手动同步到对应安装包和签名信息。

## 发布备注

- 当前正式代码版本为 `1.21.1`。
- beta 通道辅助脚本位于 `scripts/publish-beta.ps1`。
- 实际发布时请同时检查 `src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`updater.json`、`updater-beta.json` 的版本与下载地址是否一致。

## 协议声明

本项目仅供学习与交流 Tauri / Rust 技术栈使用，请遵守中国矿业大学校园网相关规定。

基于 `MIT License` 开源。
