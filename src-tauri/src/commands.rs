use crate::models::{
    BetaInstallResult, BetaInstallerInfo, Config, LoginResult, StatusResult, UpdateInfo,
};
use crate::services::{config, portal, system};

#[tauri::command]
pub fn get_config() -> Config {
    config::load_config()
}

#[tauri::command]
pub async fn save_config(config_value: Config, _app_handle: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || config::save_config_with_result(&config_value))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn relaunch_as_admin(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let relaunched = config::relaunch_as_admin()?;

    if relaunched {
        let handle = app_handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(250));
            handle.exit(0);
        });
    }

    Ok(relaunched)
}

#[tauri::command]
pub fn is_running_as_admin() -> Result<bool, String> {
    config::is_running_as_admin()
}

#[tauri::command]
pub async fn check_connection() -> StatusResult {
    portal::check_connection().await
}

#[tauri::command]
pub async fn do_login(
    config_value: Config,
    app_handle: tauri::AppHandle,
    force: bool,
) -> LoginResult {
    portal::login(config_value, app_handle, force).await
}

#[tauri::command]
pub async fn do_logout() -> LoginResult {
    portal::logout().await
}

#[tauri::command]
pub fn notify_drop(app_handle: tauri::AppHandle) {
    system::notify_drop(app_handle);
}

#[tauri::command]
pub fn notify_update_available(app_handle: tauri::AppHandle, version: String) {
    system::notify_update_available(app_handle, &version);
}

#[tauri::command]
pub async fn check_internet_access() -> bool {
    system::check_internet_access().await
}

#[tauri::command]
pub async fn check_for_updates(app_handle: tauri::AppHandle) -> Result<UpdateInfo, String> {
    system::check_for_updates(app_handle).await
}

#[tauri::command]
pub async fn install_update(app_handle: tauri::AppHandle) -> Result<(), String> {
    system::install_update(app_handle).await
}

#[tauri::command]
pub async fn get_beta_installer_info() -> Result<BetaInstallerInfo, String> {
    system::get_beta_installer_info().await
}

#[tauri::command]
pub async fn get_stable_installer_info() -> Result<BetaInstallerInfo, String> {
    system::get_stable_installer_info().await
}

#[tauri::command]
pub async fn install_beta_update() -> Result<BetaInstallResult, String> {
    system::install_beta_update().await
}

#[tauri::command]
pub async fn install_stable_update() -> Result<BetaInstallResult, String> {
    system::install_stable_update().await
}

#[tauri::command]
pub fn restart_app(app_handle: tauri::AppHandle) {
    system::restart_app(app_handle);
}
