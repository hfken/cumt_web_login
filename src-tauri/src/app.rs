use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
};

use crate::services::{config, system};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            reveal_main_window(app);
            system::show_notification(
                app,
                "校园网自动登录",
                "程序已在系统托盘静默运行中，请勿重复打开！",
            );
        }))
        .system_tray(build_tray())
        .on_system_tray_event(handle_tray_event)
        .invoke_handler(tauri::generate_handler![
            crate::commands::get_config,
            crate::commands::save_config,
            crate::commands::relaunch_as_admin,
            crate::commands::check_connection,
            crate::commands::do_login,
            crate::commands::do_logout,
            crate::commands::notify_drop,
            crate::commands::notify_update_available,
            crate::commands::check_internet_access,
            crate::commands::check_for_updates,
            crate::commands::install_update,
            crate::commands::get_beta_installer_info,
            crate::commands::get_stable_installer_info,
            crate::commands::install_beta_update,
            crate::commands::install_stable_update,
            crate::commands::restart_app
        ])
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            let saved_config = config::load_config();

            let refresh_config = saved_config.clone();
            tauri::async_runtime::spawn_blocking(move || {
                config::refresh_auto_login(&refresh_config);
            });

            if args.iter().any(|arg| arg == "--hidden") {
                if let Some(window) = app.get_window("main") {
                    let _ = window.hide();
                }

                if saved_config.auto_login {
                    let app_handle = app.handle();
                    tauri::async_runtime::spawn(async move {
                        let _ =
                            crate::services::portal::login(saved_config, app_handle, true).await;
                    });
                }
            } else {
                reveal_main_window(app);
            }

            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                let _ = event.window().hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_tray() -> SystemTray {
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

    SystemTray::new()
        .with_menu(tray_menu)
        .with_tooltip("校园网自动登录")
}

fn handle_tray_event(app: &tauri::AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick { .. } => reveal_main_window(app),
        SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
            "show" => reveal_main_window(app),
            "login" => {
                let saved_config = config::load_config();
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = crate::services::portal::login(saved_config, app_handle, true).await;
                });
            }
            "logout" => {
                tauri::async_runtime::spawn(async move {
                    let _ = crate::services::portal::logout().await;
                });
            }
            "quit" => std::process::exit(0),
            _ => {}
        },
        _ => {}
    }
}

fn reveal_main_window<R: tauri::Runtime>(app: &impl Manager<R>) {
    if let Some(window) = app.get_window("main") {
        let _ = window.center();
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
