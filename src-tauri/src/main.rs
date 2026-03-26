#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem};
use tauri::api::notification::Notification;
use serde_json;
use reqwest;
use winreg::enums::*;
use winreg::RegKey;
use tauri_plugin_single_instance;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
struct Config {
    student_id: String,
    password: String,
    operator: String,
    auto_login: bool,
    check_interval: u32,
    auto_check: bool,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            student_id: "".into(),
            password: "".into(),
            operator: "cmcc".into(),
            auto_login: false,
            check_interval: 15,
            auto_check: true,
        }
    }
}

#[derive(Serialize)]
struct StatusResult {
    connected: bool,
    message: String,
    ip: String,
}

#[derive(Serialize)]
struct UpdateInfo {
    available: bool,
    version: String,
    notes: String,
}

#[derive(Serialize)]
struct LoginResult {
    success: bool,
    message: String,
}

fn get_config_path() -> PathBuf {
    let mut path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    path.push("config.json");
    if let Some(proj_dirs) = directories::ProjectDirs::from("com", "cumt", "campuslogin") {
        let dir = proj_dirs.data_dir();
        let _ = fs::create_dir_all(dir);
        return dir.join("config.json");
    }
    path
}

#[tauri::command]
fn get_config() -> Config {
    let path = get_config_path();
    if let Ok(data) = fs::read_to_string(&path) {
        if let Ok(config) = serde_json::from_str(&data) {
            return config;
        }
    }
    Config::default()
}

#[tauri::command]
fn save_config(config: Config, _app_handle: tauri::AppHandle) {
    let path = get_config_path();
    if let Ok(json) = serde_json::to_string_pretty(&config) {
        let _ = fs::write(path, json);
    }
    
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(run_key) = hkcu.open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_SET_VALUE | KEY_READ) {
        let exe_path = format!("\"{}\" --hidden", std::env::current_exe().unwrap_or_default().to_string_lossy());
        if config.auto_login {
            let _ = run_key.set_value("CampusNetworkAutoLogin", &exe_path);
        } else {
            let _ = run_key.delete_value("CampusNetworkAutoLogin");
        }
    }
}

#[tauri::command]
async fn check_connection() -> StatusResult {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(3)).build().unwrap();
    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
    let v_key = fastrand::u32(1000..9999);
    
    let url = format!("http://10.2.5.251/drcom/chkstatus?callback=dr{}&v={}", timestamp, v_key);
    
    if let Ok(res) = client.get(&url).send().await {
        if let Ok(text) = res.text().await {
            if let Some(start) = text.find('(') {
                if let Some(end) = text.rfind(')') {
                    let json_str = &text[start+1..end];
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
                        let ip = parsed["v46ip"].as_str().or(parsed["v4ip"].as_str()).or(parsed["ss5"].as_str()).unwrap_or("").to_string();
                        if parsed["result"].as_i64() == Some(1) {
                            return StatusResult { connected: true, message: format!("已在线 ({})", parsed["uid"].as_str().unwrap_or("网络畅通")), ip };
                        } else {
                            return StatusResult { connected: false, message: "未登录 (需要认证)".into(), ip };
                        }
                    }
                }
            }
        }
    }
    StatusResult { connected: false, message: "无法连接校园网服务器".into(), ip: "".into() }
}

#[tauri::command]
async fn do_login(config: Config, app_handle: tauri::AppHandle) -> LoginResult {
    let status = check_connection().await;
    let account = if config.operator == "none" { config.student_id.clone() } else { format!("{}@{}", config.student_id, config.operator) };
    
    if status.connected {
        if status.message.contains(&account) {
            let _ = Notification::new(&app_handle.config().tauri.bundle.identifier)
                .title("中国矿业大学校园网")
                .body("网络已处于在线状态，无需重复登录")
                .show();
            return LoginResult { success: true, message: status.message };
        }
    }
    
    let ip = status.ip.clone();
    
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).build().unwrap();
    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
    
    let enc_account = urlencoding::encode(&account);
    let enc_password = urlencoding::encode(&config.password);
    
    let login_url = format!("http://10.2.5.251:801/eportal/?c=Portal&a=login&callback=dr{}&login_method=1&user_account={}&user_password={}&wlan_user_ip={}&wlan_user_mac=000000000000&wlan_ac_ip=&wlan_ac_name=&jsVersion=3.0&_={}", timestamp, enc_account, enc_password, ip, timestamp);
    
    if let Ok(res) = client.get(&login_url).send().await {
        if let Ok(text) = res.text().await {
            if text.contains("\"result\":\"1\"") || text.contains("\"result\":1") || text.contains("成功") || text.contains("success") {
                let _ = Notification::new(&app_handle.config().tauri.bundle.identifier)
                    .title("中国矿业大学校园网")
                    .body(&format!("学号 {} 已成功连接到校园网！", config.student_id))
                    .show();
                return LoginResult { success: true, message: "登录成功或已在线".into() };
            } else {
                return LoginResult { success: false, message: "认证失败（账号密码错误）".into() };
            }
        }
    }
    LoginResult { success: false, message: "网络请求失败".into() }
}

#[tauri::command]
async fn do_logout() -> LoginResult {
    let status = check_connection().await;
    if !status.connected {
        return LoginResult { success: true, message: "当前未登录，无需注销".into() };
    }
    let ip = status.ip;
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).build().unwrap();
    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
    let logout_url = format!("http://10.2.5.251:801/eportal/?c=Portal&a=logout&callback=dr{}&login_method=1&user_account=drcom&user_password=123&ac_logout=0&wlan_user_ip={}&wlan_user_ipv6=&wlan_vlan_id=1&wlan_user_mac=000000000000&wlan_ac_ip=&wlan_ac_name=&jsVersion=3.0&_={}", timestamp, ip, timestamp);
    
    if let Ok(res) = client.get(&logout_url).send().await {
        if let Ok(text) = res.text().await {
            if text.contains("\"result\":\"1\"") || text.contains("\"result\":1") || text.contains("成功") || text.contains("success") {
                return LoginResult { success: true, message: "注销成功".into() };
            } else {
                return LoginResult { success: false, message: "注销失败".into() };
            }
        }
    }
    LoginResult { success: false, message: "网络请求失败".into() }
}

#[tauri::command]
fn notify_drop(app_handle: tauri::AppHandle) {
    let _ = Notification::new(&app_handle.config().tauri.bundle.identifier)
        .title("中国矿业大学校园网")
        .body("⚠ 糟糕，网络已断线！由于网络波动或在另一设备上登录，请重新认证。")
        .show();
}

#[tauri::command]
async fn check_for_updates(app_handle: tauri::AppHandle) -> Result<UpdateInfo, String> {
    match tauri::updater::builder(app_handle.clone()).check().await {
        Ok(update) => {
            Ok(UpdateInfo {
                available: update.is_update_available(),
                version: update.latest_version().to_string(),
                notes: update.body().cloned().unwrap_or_default(),
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn install_update(app_handle: tauri::AppHandle) -> Result<(), String> {
    match tauri::updater::builder(app_handle.clone()).check().await {
        Ok(update) => {
            if update.is_update_available() {
                update.download_and_install().await.map_err(|e| e.to_string())?;
                Ok(())
            } else {
                Err("已经是最新版本".to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn restart_app(app_handle: tauri::AppHandle) {
    app_handle.restart();
}

fn main() {
    let show = CustomMenuItem::new("show".to_string(), "显示主界面");
    let login = CustomMenuItem::new("login".to_string(), "静默登录");
    let logout = CustomMenuItem::new("logout".to_string(), "静默注销");
    let quit = CustomMenuItem::new("quit".to_string(), "完全退出");
    
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(login)
        .add_item(logout)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);
        
    let tray = SystemTray::new().with_menu(tray_menu).with_tooltip("校园网自动登录");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            let _ = Notification::new(&app.config().tauri.bundle.identifier)
                .title("校园网自动登录")
                .body("程序已在系统托盘静默运行中，请勿重复打开！")
                .show();
        }))
        .system_tray(tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                let window = app.get_window("main").unwrap();
                window.show().unwrap();
                window.set_focus().unwrap();
            }
            SystemTrayEvent::MenuItemClick { id, .. } => {
                match id.as_str() {
                    "show" => {
                        let window = app.get_window("main").unwrap();
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                    "login" => {
                        let config = get_config();
                        let _ = do_login(config, app.clone());
                    }
                    "logout" => {
                        let _ = do_logout();
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            get_config, 
            save_config, 
            check_connection, 
            do_login, 
            do_logout, 
            notify_drop,
            check_for_updates,
            install_update,
            restart_app
        ])
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--hidden".to_string()) {
                window.hide().unwrap();
                let config = get_config();
                if config.auto_login {
                    let _ = do_login(config, app.handle());
                }
            } else {
                window.show().unwrap();
            }
            Ok(())
        })
        .on_window_event(|event| match event.event() {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                event.window().hide().unwrap();
                api.prevent_close();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
