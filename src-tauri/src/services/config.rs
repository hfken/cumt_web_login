use std::fs;
use std::path::{Path, PathBuf};

use directories::ProjectDirs;

use crate::models::Config;

#[cfg(target_os = "windows")]
const AUTO_LOGIN_TASK_NAME: &str = "CampusNetworkAutoLogin";
#[cfg(target_os = "windows")]
const ELEVATED_AUTOSTART_FLAG: &str = "--elevated-autostart";
#[cfg(target_os = "windows")]
const ELEVATED_AUTOSTART_TARGET_FLAG: &str = "--autostart-target";
#[cfg(target_os = "windows")]
const WAIT_FOR_PID_FLAG: &str = "--wait-for-pid";

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
enum AutoLoginAction {
    Enable,
    Disable,
}

#[cfg(target_os = "windows")]
impl AutoLoginAction {
    fn as_arg(self) -> &'static str {
        match self {
            Self::Enable => "enable",
            Self::Disable => "disable",
        }
    }

    fn from_arg(value: &str) -> Option<Self> {
        match value {
            "enable" => Some(Self::Enable),
            "disable" => Some(Self::Disable),
            _ => None,
        }
    }
}

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

pub fn save_config_with_result(config: &Config) -> Result<(), String> {
    let path = get_config_path();

    if let Ok(json) = serde_json::to_string_pretty(config) {
        let _ = fs::write(path, json);
    }

    sync_auto_login(config)
}

pub fn refresh_auto_login(config: &Config) {
    let _ = sync_auto_login(config);
}

#[cfg(target_os = "windows")]
pub fn maybe_run_elevated_autostart_helper() -> Option<i32> {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() != Some(ELEVATED_AUTOSTART_FLAG) {
        return None;
    }

    let action = match args.next().as_deref().and_then(AutoLoginAction::from_arg) {
        Some(action) => action,
        None => return Some(2),
    };

    let mut target_exe = None;
    while let Some(arg) = args.next() {
        if arg == ELEVATED_AUTOSTART_TARGET_FLAG {
            target_exe = args.next();
            break;
        }
    }

    let target_exe = target_exe
        .map(PathBuf::from)
        .or_else(|| std::env::current_exe().ok())
        .unwrap_or_default();

    cleanup_legacy_auto_login_registry();

    match apply_auto_login_action(action, &target_exe, false) {
        Ok(()) => Some(0),
        Err(_) => Some(1),
    }
}

#[cfg(not(target_os = "windows"))]
pub fn maybe_run_elevated_autostart_helper() -> Option<i32> {
    None
}

#[cfg(target_os = "windows")]
pub fn maybe_wait_for_previous_instance() {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE};

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == WAIT_FOR_PID_FLAG {
            let Some(pid_arg) = args.next() else {
                return;
            };

            let Ok(pid) = pid_arg.parse::<u32>() else {
                return;
            };

            let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
            if !handle.is_null() {
                unsafe {
                    WaitForSingleObject(handle, 10_000);
                    CloseHandle(handle);
                }
            }
            return;
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn maybe_wait_for_previous_instance() {}

#[cfg(target_os = "windows")]
pub fn relaunch_as_admin() -> Result<bool, String> {
    if is_process_elevated()? {
        return Ok(false);
    }

    run_elevated_full_app()?;
    Ok(true)
}

#[cfg(not(target_os = "windows"))]
pub fn relaunch_as_admin() -> Result<bool, String> {
    Err("当前平台不支持管理员提权重启。".into())
}

#[cfg(target_os = "windows")]
pub fn is_running_as_admin() -> Result<bool, String> {
    is_process_elevated()
}

#[cfg(not(target_os = "windows"))]
pub fn is_running_as_admin() -> Result<bool, String> {
    Ok(false)
}

#[cfg(target_os = "windows")]
fn sync_auto_login(config: &Config) -> Result<(), String> {
    cleanup_legacy_auto_login_registry();
    let target_exe = std::env::current_exe().map_err(|error| error.to_string())?;

    if config.auto_login {
        apply_auto_login_action(AutoLoginAction::Enable, &target_exe, true)
    } else {
        apply_auto_login_action(AutoLoginAction::Disable, &target_exe, true)
    }
}

#[cfg(target_os = "windows")]
fn apply_auto_login_action(
    action: AutoLoginAction,
    target_exe: &Path,
    allow_elevation: bool,
) -> Result<(), String> {
    let result = match action {
        AutoLoginAction::Enable => create_auto_login_task(target_exe),
        AutoLoginAction::Disable => delete_auto_login_task(),
    };

    match result {
        Ok(()) => Ok(()),
        Err(message) if allow_elevation && needs_elevation(&message) => {
            run_elevated_autostart_helper(action, target_exe)
        }
        Err(message) => Err(format_schtasks_error(&message)),
    }
}

#[cfg(target_os = "windows")]
fn create_auto_login_task(target_exe: &Path) -> Result<(), String> {
    let task_run = format!(
        "\"{}\" --hidden",
        target_exe.to_string_lossy()
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
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

    let output = Command::new("schtasks")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let message = if !stderr.is_empty() { stderr } else { stdout };

    Err(message)
}

#[cfg(target_os = "windows")]
fn needs_elevation(message: &str) -> bool {
    let lower = message.trim().to_lowercase();

    lower.contains("access is denied")
        || lower.contains("拒绝访问")
        || lower.contains("elevation")
        || lower.contains("需要提升")
}

#[cfg(target_os = "windows")]
fn run_elevated_full_app() -> Result<(), String> {
    let current_pid = std::process::id();
    let parameters = format!("{flag} {pid}", flag = WAIT_FOR_PID_FLAG, pid = current_pid);
    runas_launch_current_exe(&parameters)
}

#[cfg(target_os = "windows")]
fn run_elevated_autostart_helper(
    action: AutoLoginAction,
    target_exe: &Path,
) -> Result<(), String> {
    let parameters = format!(
        "{flag} {action} {target_flag} \"{target}\"",
        flag = ELEVATED_AUTOSTART_FLAG,
        action = action.as_arg(),
        target_flag = ELEVATED_AUTOSTART_TARGET_FLAG,
        target = target_exe.to_string_lossy()
    );

    runas_launch_current_exe(&parameters)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn runas_launch_current_exe(parameters: &str) -> Result<(), String> {
    use std::mem::size_of;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SHELLEXECUTEINFOW};
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

    let exe_path = std::env::current_exe().map_err(|error| error.to_string())?;
    let verb = to_wide("runas");
    let file = to_wide(&exe_path.to_string_lossy());
    let params = to_wide(parameters);

    let mut execute_info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    execute_info.cbSize = size_of::<SHELLEXECUTEINFOW>() as u32;
    execute_info.fMask = SEE_MASK_FLAG_NO_UI;
    execute_info.hwnd = null_mut();
    execute_info.lpVerb = verb.as_ptr();
    execute_info.lpFile = file.as_ptr();
    execute_info.lpParameters = params.as_ptr();
    execute_info.lpDirectory = null();
    execute_info.nShow = SW_HIDE;

    let success = unsafe { ShellExecuteExW(&mut execute_info) };
    if success == 0 {
        let error_code = std::io::Error::last_os_error().raw_os_error().unwrap_or_default();
        return Err(match error_code {
            1223 => "配置已保存，但你取消了管理员授权，未能完成开机自启动设置。".into(),
            _ => "配置已保存，但拉起管理员授权失败，未能完成开机自启动设置。".into(),
        });
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn is_process_elevated() -> Result<bool, String> {
    use std::mem::size_of;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    let mut token_handle = std::ptr::null_mut();
    let opened = unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token_handle) };
    if opened == 0 {
        return Err("无法读取当前进程权限状态。".into());
    }

    let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
    let mut return_length = 0u32;
    let result = unsafe {
        GetTokenInformation(
            token_handle,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut return_length,
        )
    };

    unsafe {
        CloseHandle(token_handle);
    }

    if result == 0 {
        return Err("无法检测当前是否为管理员模式。".into());
    }

    Ok(elevation.TokenIsElevated != 0)
}

#[cfg(target_os = "windows")]
fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn format_schtasks_error(message: &str) -> String {
    let normalized = message.trim();
    let lower = normalized.to_lowercase();

    if lower.contains("access is denied")
        || lower.contains("拒绝访问")
        || lower.contains("需要提升")
        || lower.contains("elevation")
    {
        return "配置已保存，但创建开机自启动计划任务失败：当前权限不足。请用管理员模式重新打开程序后再试。".into();
    }

    if normalized.is_empty() {
        "配置已保存，但执行 schtasks 失败，未能完成开机自启动设置。".into()
    } else {
        format!("配置已保存，但开机自启动设置失败：{}", normalized)
    }
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
fn sync_auto_login(_config: &Config) -> Result<(), String> {
    Ok(())
}
