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

## 开发

```bash
npm install
npm run tauri dev
```

前端静态资源直接位于 `src/`，Tauri 的 `devPath` / `distDir` 也都指向这个目录。

## 构建

```bash
npm run tauri build
```

构建完成后，安装包和 updater 产物会输出到 `src-tauri/target/release/bundle/nsis/`。

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
