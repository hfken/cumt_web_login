use std::fs;
use std::path::PathBuf;

use directories::ProjectDirs;

use crate::models::Config;

#[cfg(target_os = "windows")]
const AUTO_LOGIN_TASK_NAME: &str = "CampusNetworkAutoLogin";

pub fn get_config_path() -> PathBuf {
    let mut fallback = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    fallback.push("config.json");

    if let Some(project_dirs) = ProjectDirs::from("com", "cumt", "campuslogin") {
        let data_dir = project_dirs.data_dir();
        let _ = fs::create_dir_all(data_dir);
        return data_dir.join("config.json");
    }

    fallback
}

pub fn load_config() -> Config {
    let path = get_config_path();

    if let Ok(data) = fs::read_to_string(path) {
        if let Ok(config) = serde_json::from_str(&data) {
            return config;
        }
    }

    Config::default()
}

pub fn save_config(config: &Config) {
    let path = get_config_path();

    if let Ok(json) = serde_json::to_string_pretty(config) {
        let _ = fs::write(path, json);
    }

    sync_auto_login(config);
}

pub fn refresh_auto_login(config: &Config) {
    sync_auto_login(config);
}

#[cfg(target_os = "windows")]
fn sync_auto_login(config: &Config) {
    cleanup_legacy_auto_login_registry();

    if config.auto_login {
        let _ = create_auto_login_task();
    } else {
        let _ = delete_auto_login_task();
    }
}

#[cfg(target_os = "windows")]
fn create_auto_login_task() -> Result<(), String> {
    let task_run = format!(
        "\"{}\" --hidden",
        std::env::current_exe()
            .map_err(|error| error.to_string())?
            .to_string_lossy()
    );

    run_schtasks(&[
        "/Create",
        "/TN",
        AUTO_LOGIN_TASK_NAME,
        "/SC",
        "ONLOGON",
        "/TR",
        &task_run,
        "/IT",
        "/F",
    ])
}

#[cfg(target_os = "windows")]
fn delete_auto_login_task() -> Result<(), String> {
    run_schtasks(&["/Delete", "/TN", AUTO_LOGIN_TASK_NAME, "/F"])
        .or_else(|error| match error.contains("cannot find the file specified") {
            true => Ok(()),
            false => Err(error),
        })
}

#[cfg(target_os = "windows")]
fn run_schtasks(args: &[&str]) -> Result<(), String> {
    let output = std::process::Command::new("schtasks")
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let message = if !stderr.is_empty() { stderr } else { stdout };

    Err(if message.is_empty() {
        "schtasks 执行失败".into()
    } else {
        message
    })
}

#[cfg(target_os = "windows")]
fn cleanup_legacy_auto_login_registry() {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    if let Ok(run_key) = hkcu.open_subkey_with_flags(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        KEY_SET_VALUE | KEY_READ,
    ) {
        let _ = run_key.delete_value(AUTO_LOGIN_TASK_NAME);
    }
}

#[cfg(not(target_os = "windows"))]
fn sync_auto_login(_config: &Config) {}
