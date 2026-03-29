use serde::Deserialize;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::api::notification::Notification;
use tauri::AppHandle;

use crate::models::{BetaInstallResult, BetaInstallerInfo, UpdateInfo};

const BETA_UPDATER_ENDPOINT: &str =
    "https://gitee.com/huangyaowei2005/cumt_web_login/raw/beta/updater-beta.json";

#[derive(Deserialize)]
struct BetaUpdaterManifest {
    version: Option<String>,
    notes: Option<String>,
    platforms: Option<BetaUpdaterPlatforms>,
}

#[derive(Deserialize)]
struct BetaUpdaterPlatforms {
    #[serde(rename = "windows-x86_64")]
    windows_x86_64: Option<BetaUpdaterPlatform>,
}

#[derive(Deserialize)]
struct BetaUpdaterPlatform {
    url: Option<String>,
}

pub fn show_notification(app_handle: &AppHandle, title: &str, body: &str) {
    let _ = Notification::new(&app_handle.config().tauri.bundle.identifier)
        .title(title)
        .body(body)
        .show();
}

pub fn notify_drop(app_handle: AppHandle) {
    show_notification(
        &app_handle,
        "中国矿业大学校园网",
        "⚠ 糟糕，网络已断线！由于网络波动或在另一设备上登录，请重新认证。",
    );
}

pub async fn check_for_updates(app_handle: AppHandle) -> Result<UpdateInfo, String> {
    match tauri::updater::builder(app_handle.clone()).check().await {
        Ok(update) => Ok(UpdateInfo {
            available: update.is_update_available(),
            version: update.latest_version().to_string(),
            notes: update.body().cloned().unwrap_or_default(),
        }),
        Err(error) => Err(error.to_string()),
    }
}

pub async fn install_update(app_handle: AppHandle) -> Result<(), String> {
    match tauri::updater::builder(app_handle.clone()).check().await {
        Ok(update) => {
            if update.is_update_available() {
                update
                    .download_and_install()
                    .await
                    .map_err(|error| error.to_string())?;
                Ok(())
            } else {
                Err("已经是最新版本".into())
            }
        }
        Err(error) => Err(error.to_string()),
    }
}

pub async fn get_beta_installer_info() -> Result<BetaInstallerInfo, String> {
    let manifest = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?
        .get(BETA_UPDATER_ENDPOINT)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<BetaUpdaterManifest>()
        .await
        .map_err(|error| error.to_string())?;

    let platform = manifest
        .platforms
        .and_then(|platforms| platforms.windows_x86_64)
        .ok_or_else(|| "beta 清单缺少 windows-x86_64 平台信息".to_string())?;

    let url = platform
        .url
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "beta 安装包地址为空".to_string())?;

    Ok(BetaInstallerInfo {
        version: manifest.version.unwrap_or_else(|| "未知版本".into()),
        notes: manifest.notes.unwrap_or_default(),
        url,
    })
}

fn resolve_beta_installer_url(beta_info: &BetaInstallerInfo) -> Result<String, String> {
    if beta_info.url.ends_with(".exe") {
        return Ok(beta_info.url.clone());
    }

    if beta_info.url.ends_with(".nsis.zip") {
        return Ok(format!(
            "{}.exe",
            beta_info.url.trim_end_matches(".nsis.zip")
        ));
    }

    Err("beta 清单未提供可直接安装的 exe 地址".to_string())
}

fn build_beta_installer_path(version: &str, installer_url: &str) -> Result<PathBuf, String> {
    let file_name = installer_url
        .rsplit('/')
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "无法解析测试版安装包文件名".to_string())?;

    let temp_dir = std::env::temp_dir().join("cumt-login-beta");
    fs::create_dir_all(&temp_dir).map_err(|error| error.to_string())?;

    let sanitized_version = version
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        })
        .collect::<String>();

    Ok(temp_dir.join(format!("{}-{}", sanitized_version, file_name)))
}

pub async fn install_beta_update() -> Result<BetaInstallResult, String> {
    let beta_info = get_beta_installer_info().await?;
    let installer_url = resolve_beta_installer_url(&beta_info)?;
    let target_path = build_beta_installer_path(&beta_info.version, &installer_url)?;

    let bytes = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?
        .get(&installer_url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .bytes()
        .await
        .map_err(|error| error.to_string())?;

    fs::write(&target_path, &bytes).map_err(|error| error.to_string())?;

    Command::new(&target_path)
        .spawn()
        .map_err(|error| format!("启动测试版安装程序失败: {}", error))?;

    Ok(BetaInstallResult {
        version: beta_info.version,
        installer_path: target_path.display().to_string(),
    })
}

pub fn restart_app(app_handle: AppHandle) {
    app_handle.restart();
}
