use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::Client;
use serde_json::Value;
use tauri::AppHandle;

use crate::models::{Config, LoginResult, StatusResult};
use crate::services::{config, system};

const DEFAULT_CAMPUS_HOST: &str = "10.2.5.251";
const DEFAULT_PORTAL_ORIGIN: &str = "http://10.2.5.251:801";

struct PortalEndpoints {
    status_origin: String,
    portal_origin: String,
}

pub async fn check_connection() -> StatusResult {
    let saved_config = config::load_config();
    check_connection_with_config(&saved_config).await
}

pub async fn login(config: Config, app_handle: AppHandle, force: bool) -> LoginResult {
    let status = check_connection_with_config(&config).await;
    let endpoints = resolve_endpoints(&config);
    let account = config.account();

    if status.connected {
        if status.message.contains(&account) {
            system::show_notification(
                &app_handle,
                "中国矿业大学校园网",
                "网络已处于在线状态，无需重复登录",
            );

            return LoginResult {
                success: true,
                message: status.message,
                ..Default::default()
            };
        }

        if !force {
            let online_user = extract_online_user(&status.message);

            return LoginResult {
                success: false,
                needs_confirm: true,
                online_user,
                message: "当前有其他账号在线".into(),
            };
        }

        let logout = logout_with_config(&config).await;
        if !logout.success {
            return LoginResult {
                success: false,
                message: format!("顶号前注销失败：{}", logout.message),
                ..Default::default()
            };
        }
    }

    let client = match build_client(5) {
        Ok(client) => client,
        Err(_) => return request_failed(),
    };

    let timestamp = now_millis();
    let login_url = format!(
        "{}/eportal/?c=Portal&a=login&callback=dr{}&login_method=1&user_account={}&user_password={}&wlan_user_ip={}&wlan_user_mac=000000000000&wlan_ac_ip=&wlan_ac_name=&jsVersion=3.0&_={}",
        endpoints.portal_origin,
        timestamp,
        urlencoding::encode(&account),
        urlencoding::encode(&config.password),
        status.ip,
        timestamp
    );

    if let Ok(response) = client.get(login_url).send().await {
        if let Ok(text) = response.text().await {
            if is_success_response(&text) {
                system::show_notification(
                    &app_handle,
                    "中国矿业大学校园网",
                    &format!("学号 {} 已成功连接到校园网！", config.student_id),
                );

                return LoginResult {
                    success: true,
                    message: "登录成功或已在线".into(),
                    ..Default::default()
                };
            }

            return LoginResult {
                success: false,
                message: "认证失败（账号密码错误）".into(),
                ..Default::default()
            };
        }
    }

    request_failed()
}

pub async fn logout() -> LoginResult {
    let saved_config = config::load_config();
    logout_with_config(&saved_config).await
}

async fn check_connection_with_config(config: &Config) -> StatusResult {
    let client = match build_client(3) {
        Ok(client) => client,
        Err(_) => return offline_status("无法连接校园网服务器"),
    };
    let endpoints = resolve_endpoints(config);

    let timestamp = now_millis();
    let v_key = fastrand::u32(1000..9999);
    let url = format!(
        "{}/drcom/chkstatus?callback=dr{}&v={}",
        endpoints.status_origin, timestamp, v_key
    );

    if let Ok(response) = client.get(url).send().await {
        if let Ok(text) = response.text().await {
            if let Some(parsed) = parse_jsonp(&text) {
                let ip = parsed["v46ip"]
                    .as_str()
                    .or(parsed["v4ip"].as_str())
                    .or(parsed["ss5"].as_str())
                    .unwrap_or("")
                    .to_string();

                if parsed["result"].as_i64() == Some(1) {
                    return StatusResult {
                        connected: true,
                        message: format!(
                            "已在线 ({})",
                            parsed["uid"].as_str().unwrap_or("网络畅通")
                        ),
                        ip,
                    };
                }

                return StatusResult {
                    connected: false,
                    message: "未登录 (需要认证)".into(),
                    ip,
                };
            }
        }
    }

    offline_status("无法连接校园网服务器")
}

async fn logout_with_config(config: &Config) -> LoginResult {
    let status = check_connection_with_config(config).await;
    let endpoints = resolve_endpoints(config);

    if !status.connected {
        return LoginResult {
            success: true,
            message: "当前未登录，无需注销".into(),
            ..Default::default()
        };
    }

    let client = match build_client(5) {
        Ok(client) => client,
        Err(_) => return request_failed(),
    };

    let timestamp = now_millis();
    let logout_url = format!(
        "{}/eportal/?c=Portal&a=logout&callback=dr{}&login_method=1&user_account=drcom&user_password=123&ac_logout=0&wlan_user_ip={}&wlan_user_ipv6=&wlan_vlan_id=1&wlan_user_mac=000000000000&wlan_ac_ip=&wlan_ac_name=&jsVersion=3.0&_={}",
        endpoints.portal_origin, timestamp, status.ip, timestamp
    );

    if let Ok(response) = client.get(logout_url).send().await {
        if let Ok(text) = response.text().await {
            return LoginResult {
                success: is_success_response(&text),
                message: if is_success_response(&text) {
                    "注销成功".into()
                } else {
                    "注销失败".into()
                },
                ..Default::default()
            };
        }
    }

    request_failed()
}

fn build_client(timeout_secs: u64) -> Result<Client, reqwest::Error> {
    Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
}

fn parse_jsonp(text: &str) -> Option<Value> {
    let start = text.find('(')?;
    let end = text.rfind(')')?;
    serde_json::from_str(&text[start + 1..end]).ok()
}

fn extract_online_user(message: &str) -> String {
    message
        .find('(')
        .and_then(|start| {
            message
                .rfind(')')
                .map(|end| message[start + 1..end].to_string())
        })
        .unwrap_or_else(|| message.to_string())
}

fn is_success_response(text: &str) -> bool {
    text.contains("\"result\":\"1\"")
        || text.contains("\"result\":1")
        || text.contains("成功")
        || text.contains("success")
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn offline_status(message: &str) -> StatusResult {
    StatusResult {
        connected: false,
        message: message.into(),
        ip: String::new(),
    }
}

fn request_failed() -> LoginResult {
    LoginResult {
        success: false,
        message: "网络请求失败".into(),
        ..Default::default()
    }
}

fn resolve_endpoints(config: &Config) -> PortalEndpoints {
    let raw_input = config.portal_address.trim();
    if raw_input.is_empty() {
        return PortalEndpoints {
            status_origin: format!("http://{}", DEFAULT_CAMPUS_HOST),
            portal_origin: DEFAULT_PORTAL_ORIGIN.into(),
        };
    }

    let candidate = if raw_input.contains("://") {
        raw_input.to_string()
    } else {
        format!("http://{}", raw_input)
    };

    if let Ok(url) = reqwest::Url::parse(&candidate) {
        if let Some(host) = url.host_str() {
            let scheme = url.scheme();
            let status_origin = format!("{}://{}", scheme, host);
            let portal_origin = if let Some(port) = url.port() {
                format!("{}://{}:{}", scheme, host, port)
            } else {
                format!("{}://{}:801", scheme, host)
            };

            return PortalEndpoints {
                status_origin,
                portal_origin,
            };
        }
    }

    PortalEndpoints {
        status_origin: format!("http://{}", DEFAULT_CAMPUS_HOST),
        portal_origin: DEFAULT_PORTAL_ORIGIN.into(),
    }
}
