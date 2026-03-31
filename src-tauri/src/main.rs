#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod app;
mod commands;
mod models;
mod services;

fn main() {
    #[cfg(target_os = "windows")]
    if let Some(exit_code) = services::config::maybe_run_elevated_autostart_helper() {
        std::process::exit(exit_code);
    }

    #[cfg(target_os = "windows")]
    services::config::maybe_wait_for_previous_instance();

    app::run();
}
