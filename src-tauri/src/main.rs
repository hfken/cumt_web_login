#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod app;
mod commands;
mod models;
mod services;

fn main() {
    app::run();
}
