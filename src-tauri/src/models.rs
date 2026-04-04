use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub student_id: String,
    pub password: String,
    pub operator: String,
    pub portal_address: String,
    pub auto_login: bool,
    pub check_interval: u32,
    pub auto_check: bool,
}

impl Config {
    pub fn account(&self) -> String {
        if self.operator == "none" {
            self.student_id.clone()
        } else {
            format!("{}@{}", self.student_id, self.operator)
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            student_id: String::new(),
            password: String::new(),
            operator: "cmcc".into(),
            portal_address: String::new(),
            auto_login: false,
            check_interval: 15,
            auto_check: true,
        }
    }
}

#[derive(Serialize)]
pub struct StatusResult {
    pub connected: bool,
    pub message: String,
    pub ip: String,
}

#[derive(Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: String,
    pub notes: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BetaInstallerInfo {
    pub version: String,
    pub notes: String,
    pub url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BetaInstallResult {
    pub version: String,
    pub installer_path: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
    pub success: bool,
    pub message: String,
    pub needs_confirm: bool,
    pub online_user: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClearConfigResult {
    pub cleared: bool,
    pub message: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoLoginSyncResult {
    pub synced: bool,
    pub relaunched: bool,
    pub message: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoLoginTaskCheckResult {
    pub enabled_in_config: bool,
    pub task_exists: bool,
    pub task_matches_current_exe: bool,
    pub needs_attention: bool,
    pub message: String,
}
