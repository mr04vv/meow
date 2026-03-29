use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

use crate::auth::AuthConfig;
use crate::commands::collection_env::load_active_collection_variables_inner;
use crate::error::AppError;
use crate::storage::DbState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestRequest {
    pub method: String,
    pub url: String,
    pub headers: Option<HashMap<String, String>>,
    pub query_params: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
    pub follow_redirects: Option<bool>,
    pub collection_id: Option<String>,
    pub auth_type: Option<String>,
    pub auth_config: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub response_time_ms: u64,
    pub body_size_bytes: u64,
    pub is_json: bool,
}

fn build_variable_map(
    conn: &rusqlite::Connection,
    collection_id: Option<&str>,
) -> HashMap<String, String> {
    let Some(cid) = collection_id else {
        return HashMap::new();
    };
    load_active_collection_variables_inner(conn, cid)
        .unwrap_or_default()
        .into_iter()
        .map(|v| (v.key, v.value))
        .collect()
}

/// Auth info resolved from DB (sync)
struct ResolvedAuth {
    headers: HashMap<String, String>,
    query_params: HashMap<String, String>,
    /// If Cognito, contains the credentials to authenticate
    cognito_config: Option<CognitoCredentials>,
}

struct CognitoCredentials {
    client_id: String,
    username: String,
    password: String,
    region: String,
}

/// Resolve auth from DB (sync part — no network calls)
fn resolve_auth_from_db(
    conn: &rusqlite::Connection,
    request: &RestRequest,
    vars: &HashMap<String, String>,
) -> Result<ResolvedAuth, AppError> {
    // If the request has explicit auth, use it
    if let Some(auth_type) = &request.auth_type {
        if auth_type != "none" {
            if let Some(auth_config_json) = &request.auth_config {
                if let Ok(config) = serde_json::from_str::<AuthConfig>(auth_config_json) {
                    let applied = config.apply();
                    return Ok(ResolvedAuth {
                        headers: applied.headers,
                        query_params: applied.query_params,
                        cognito_config: None,
                    });
                }
            }
        }
        return Ok(ResolvedAuth { headers: HashMap::new(), query_params: HashMap::new(), cognito_config: None });
    }

    // Walk up parent chain to find collection with auth
    let Some(start_id) = &request.collection_id else {
        return Ok(ResolvedAuth { headers: HashMap::new(), query_params: HashMap::new(), cognito_config: None });
    };

    let mut current_id = start_id.clone();
    let mut found_auth_type: Option<String> = None;
    let mut found_auth_config: Option<String> = None;

    for _ in 0..10 {
        let row = conn.query_row(
            "SELECT auth_type, auth_config, parent_id FROM collections WHERE id = ?1",
            rusqlite::params![current_id],
            |row| Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
            )),
        );
        let Ok((at, ac, parent_id)) = row else { break };
        if at.is_some() && at.as_deref() != Some("none") {
            found_auth_type = at;
            found_auth_config = ac;
            break;
        }
        let Some(pid) = parent_id else { break };
        current_id = pid;
    }

    let Some(auth_type) = found_auth_type else {
        return Ok(ResolvedAuth { headers: HashMap::new(), query_params: HashMap::new(), cognito_config: None });
    };

    // Decrypt auth_config
    let auth_config_str = match found_auth_config {
        Some(cfg) => {
            let decrypted = match crate::storage::database::get_encryption_key(conn) {
                Ok(key) => crate::crypto::decrypt(&cfg, &key).unwrap_or(cfg),
                Err(_) => cfg,
            };
            interpolate(&decrypted, vars)
        }
        None => return Ok(ResolvedAuth { headers: HashMap::new(), query_params: HashMap::new(), cognito_config: None }),
    };

    if auth_type == "cognito" {
        let config: serde_json::Value = serde_json::from_str(&auth_config_str)
            .unwrap_or(serde_json::Value::Object(Default::default()));
        let client_id = config["cognitoClientId"].as_str().unwrap_or("").to_string();
        let username = config["cognitoUsername"].as_str().unwrap_or("").to_string();
        let password = config["cognitoPassword"].as_str().unwrap_or("").to_string();
        let region = config["cognitoRegion"].as_str().unwrap_or("ap-northeast-1").to_string();

        return Ok(ResolvedAuth {
            headers: HashMap::new(),
            query_params: HashMap::new(),
            cognito_config: Some(CognitoCredentials { client_id, username, password, region }),
        });
    }

    // bearer / api_key / basic
    let config_value: serde_json::Value = serde_json::from_str(&auth_config_str)
        .unwrap_or(serde_json::Value::Object(Default::default()));
    let mut merged = match config_value {
        serde_json::Value::Object(m) => m,
        _ => Default::default(),
    };
    if !merged.contains_key("type") {
        merged.insert("type".to_string(), serde_json::json!(auth_type));
    }
    let config: AuthConfig = match serde_json::from_value(serde_json::Value::Object(merged)) {
        Ok(c) => c,
        Err(_) => return Ok(ResolvedAuth { headers: HashMap::new(), query_params: HashMap::new(), cognito_config: None }),
    };
    let applied = config.apply();
    Ok(ResolvedAuth { headers: applied.headers, query_params: applied.query_params, cognito_config: None })
}

/// Authenticate with Cognito and get id_token (async)
async fn cognito_get_fresh_token(creds: &CognitoCredentials) -> Result<String, AppError> {
    let endpoint = format!("https://cognito-idp.{}.amazonaws.com/", creds.region);
    let mut auth_params = HashMap::new();
    auth_params.insert("USERNAME", serde_json::Value::String(creds.username.clone()));
    auth_params.insert("PASSWORD", serde_json::Value::String(creds.password.clone()));

    let body = serde_json::json!({
        "AuthFlow": "USER_PASSWORD_AUTH",
        "ClientId": creds.client_id,
        "AuthParameters": auth_params,
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&endpoint)
        .header("Content-Type", "application/x-amz-json-1.1")
        .header("X-Amz-Target", "AWSCognitoIdentityProviderService.InitiateAuth")
        .json(&body)
        .send()
        .await
        .map_err(AppError::from)?;

    if !resp.status().is_success() {
        let msg = resp.text().await.unwrap_or_default();
        return Err(AppError::Custom(format!("Cognito auth failed: {}", msg)));
    }

    let result: serde_json::Value = resp.json().await.map_err(AppError::from)?;
    result["AuthenticationResult"]["IdToken"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Custom("No IdToken in Cognito response".into()))
}

fn interpolate(text: &str, vars: &HashMap<String, String>) -> String {
    let mut result = text.to_string();
    for (key, value) in vars {
        let placeholder = format!("{{{{{}}}}}", key);
        result = result.replace(&placeholder, value);
    }
    result
}

fn build_curl_command(
    method: &str,
    url: &str,
    headers: &[(String, String)],
    body: Option<&str>,
) -> String {
    let mut parts = vec![format!("curl -X {}", method)];
    for (k, v) in headers {
        parts.push(format!("-H '{}: {}'", k, v));
    }
    if let Some(b) = body {
        let escaped = b.replace('\'', "'\\''");
        parts.push(format!("-d '{}'", escaped));
    }
    parts.push(format!("'{}'", url));
    parts.join(" \\\n  ")
}

#[tauri::command]
pub async fn send_rest_request(
    state: State<'_, DbState>,
    request: RestRequest,
) -> Result<RestResponse, AppError> {
    let start = std::time::Instant::now();

    let timeout_ms = request.timeout_ms.unwrap_or(30_000);
    let follow_redirects = request.follow_redirects.unwrap_or(true);

    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout_ms));
    if !follow_redirects {
        client_builder = client_builder.redirect(reqwest::redirect::Policy::none());
    }
    let client = client_builder.build().map_err(AppError::Http)?;

    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .unwrap_or(reqwest::Method::GET);

    // Phase 1: Sync DB reads (under lock)
    let (resolved_auth, vars) = {
        let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        let vars = build_variable_map(&conn, request.collection_id.as_deref());
        let auth = resolve_auth_from_db(&conn, &request, &vars)?;
        (auth, vars)
    };
    // Lock released here

    // Phase 2: Async Cognito auth (if needed)
    let mut auth_headers = resolved_auth.headers;
    let auth_query_params = resolved_auth.query_params;

    if let Some(creds) = &resolved_auth.cognito_config {
        match cognito_get_fresh_token(creds).await {
            Ok(id_token) => {
                log::info!("[send_rest_request] Cognito auth success, token len={}", id_token.len());
                auth_headers.insert("Authorization".to_string(), format!("Bearer {}", id_token));
            }
            Err(e) => {
                log::warn!("[send_rest_request] Cognito auth failed: {}", e);
            }
        }
    }

    // Expand URL
    let expanded_url = interpolate(&request.url, &vars);
    let mut req_builder = client.request(method.clone(), &expanded_url);

    // Collect all headers for curl debug
    let mut all_headers: Vec<(String, String)> = Vec::new();

    // Apply auth headers
    for (key, value) in &auth_headers {
        req_builder = req_builder.header(key, value);
        all_headers.push((key.clone(), value.clone()));
    }

    // Apply user headers
    if let Some(headers) = &request.headers {
        for (key, value) in headers {
            let expanded_value = interpolate(value, &vars);
            req_builder = req_builder.header(key, &expanded_value);
            all_headers.push((key.clone(), expanded_value));
        }
    }

    // Apply query params
    let mut all_query_params: HashMap<String, String> = auth_query_params;
    if let Some(params) = &request.query_params {
        for (k, v) in params {
            let expanded = interpolate(v, &vars);
            all_query_params.insert(k.clone(), expanded);
        }
    }
    if !all_query_params.is_empty() {
        req_builder = req_builder.query(&all_query_params);
    }

    // Apply body
    let body_str = request.body.as_deref();
    if let Some(body) = body_str {
        let expanded_body = interpolate(body, &vars);
        req_builder = req_builder.body(expanded_body);
    }

    // Debug: log curl command
    let debug_curl = build_curl_command(&method.to_string(), &expanded_url, &all_headers, body_str);
    log::info!("[send_rest_request] {}", debug_curl);

    // Send
    let response = req_builder.send().await.map_err(AppError::from)?;
    let status = response.status().as_u16();
    let status_text = response.status().canonical_reason().unwrap_or("").to_string();

    let mut resp_headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(v) = value.to_str() {
            resp_headers.insert(key.to_string(), v.to_string());
        }
    }

    let body = response.text().await.map_err(AppError::from)?;
    let body_size_bytes = body.len() as u64;
    let is_json = serde_json::from_str::<serde_json::Value>(&body).is_ok();
    let response_time_ms = start.elapsed().as_millis() as u64;

    Ok(RestResponse {
        status,
        status_text,
        headers: resp_headers,
        body,
        response_time_ms,
        body_size_bytes,
        is_json,
    })
}
