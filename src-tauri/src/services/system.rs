use tauri::api::notification::Notification;
use tauri::AppHandle;

use crate::models::UpdateInfo;

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

pub fn restart_app(app_handle: AppHandle) {
    app_handle.restart();
}
