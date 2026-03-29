use std::fs;
use std::path::PathBuf;

use directories::ProjectDirs;

use crate::models::Config;

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

    sync_auto_login_registry(config);
}

#[cfg(target_os = "windows")]
fn sync_auto_login_registry(config: &Config) {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    if let Ok(run_key) = hkcu.open_subkey_with_flags(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        KEY_SET_VALUE | KEY_READ,
    ) {
        let exe_path = format!(
            "\"{}\" --hidden",
            std::env::current_exe()
                .unwrap_or_default()
                .to_string_lossy()
        );

        if config.auto_login {
            let _ = run_key.set_value("CampusNetworkAutoLogin", &exe_path);
        } else {
            let _ = run_key.delete_value("CampusNetworkAutoLogin");
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn sync_auto_login_registry(_config: &Config) {}
