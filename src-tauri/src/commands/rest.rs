use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

use crate::auth::AuthConfig;
use crate::commands::collection_env::load_active_collection_variables_inner;
use crate::error::AppError;
use crate::storage::DbState;

#[derive(Debug, Deserialize)]
pub struct RestRequest {
    pub method: String,
    pub url: String,
    pub headers: Option<HashMap<String, String>>,
    pub query_params: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
    pub follow_redirects: Option<bool>,
    /// Collection ID used to resolve variables and auth
    pub collection_id: Option<String>,
    /// Auth type for this specific request (None = inherit from collection)
    pub auth_type: Option<String>,
    /// Auth config JSON for this specific request
    pub auth_config: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RestResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub response_time_ms: u64,
    pub body_size_bytes: u64,
    pub is_json: bool,
}

/// Build the variable map for a request using the collection's active environment variables.
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

/// Resolve the auth headers/query-params to inject for a request.
/// If the request has its own auth, use it. Otherwise fall back to collection auth.
fn resolve_auth_headers(
    conn: &rusqlite::Connection,
    request: &RestRequest,
    vars: &HashMap<String, String>,
) -> Result<(HashMap<String, String>, HashMap<String, String>), AppError> {
    // If the request has explicit auth, use it (no collection fallback needed)
    if let Some(auth_type) = &request.auth_type {
        if auth_type != "none" {
            if let Some(auth_config_json) = &request.auth_config {
                if let Ok(config) = serde_json::from_str::<AuthConfig>(auth_config_json) {
                    let applied = config.apply();
                    return Ok((applied.headers, applied.query_params));
                }
            }
        }
        // auth_type is "none" or config missing — no auth
        return Ok((HashMap::new(), HashMap::new()));
    }

    // No request-level auth — try to inherit from collection
    let Some(collection_id) = &request.collection_id else {
        return Ok((HashMap::new(), HashMap::new()));
    };

    // Query collection auth settings
    let collection_row = conn.query_row(
        "SELECT auth_type, auth_config FROM collections WHERE id = ?1",
        rusqlite::params![collection_id],
        |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        },
    );

    let Ok((col_auth_type, col_auth_config)) = collection_row else {
        return Ok((HashMap::new(), HashMap::new()));
    };

    let Some(auth_type) = col_auth_type else {
        return Ok((HashMap::new(), HashMap::new()));
    };

    if auth_type == "none" {
        return Ok((HashMap::new(), HashMap::new()));
    }

    // Decrypt and expand variables in auth_config
    let auth_config_str = match col_auth_config {
        Some(cfg) => {
            // Try to decrypt (may be encrypted or legacy plaintext)
            let decrypted = match crate::storage::database::get_encryption_key(conn) {
                Ok(key) => crate::crypto::decrypt(&cfg, &key).unwrap_or(cfg),
                Err(_) => cfg,
            };
            interpolate(&decrypted, vars)
        }
        None => return Ok((HashMap::new(), HashMap::new())),
    };

    if auth_type == "cognito" {
        // Fetch stored Cognito id_token and apply as Bearer
        let token_row = conn.query_row(
            "SELECT id_token FROM cognito_tokens WHERE collection_id = ?1",
            rusqlite::params![collection_id],
            |row| row.get::<_, String>(0),
        );

        if let Ok(id_token) = token_row {
            let mut headers = HashMap::new();
            headers.insert("Authorization".to_string(), format!("Bearer {}", id_token));
            return Ok((headers, HashMap::new()));
        }
        return Ok((HashMap::new(), HashMap::new()));
    }

    // For bearer / api_key / basic: parse the (possibly variable-expanded) auth config
    let config_value: serde_json::Value = serde_json::from_str(&auth_config_str)
        .unwrap_or(serde_json::Value::Object(Default::default()));

    // Merge auth_type into the config so AuthConfig can deserialize via its tag
    let mut merged = match config_value {
        serde_json::Value::Object(m) => m,
        _ => Default::default(),
    };
    if !merged.contains_key("type") {
        merged.insert("type".to_string(), serde_json::json!(auth_type));
    }

    let config: AuthConfig = match serde_json::from_value(serde_json::Value::Object(merged)) {
        Ok(c) => c,
        Err(_) => return Ok((HashMap::new(), HashMap::new())),
    };

    let applied = config.apply();
    Ok((applied.headers, applied.query_params))
}

/// Replace {{key}} patterns with values from the map
fn interpolate(text: &str, vars: &HashMap<String, String>) -> String {
    let mut result = text.to_string();
    for (key, value) in vars {
        let placeholder = format!("{{{{{}}}}}", key);
        result = result.replace(&placeholder, value);
    }
    result
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

    // Build variable map and resolve auth
    let (auth_headers, auth_query_params, vars) = {
        let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        let vars = build_variable_map(&conn, request.collection_id.as_deref());
        let auth = resolve_auth_headers(&conn, &request, &vars)?;
        (auth.0, auth.1, vars)
    };

    // Expand {{variable}} placeholders in URL
    let expanded_url = interpolate(&request.url, &vars);
    let mut req_builder = client.request(method, &expanded_url);

    // Apply request headers (user-set headers take precedence over auth headers)
    if !auth_headers.is_empty() {
        for (key, value) in &auth_headers {
            req_builder = req_builder.header(key, value);
        }
    }

    if let Some(headers) = request.headers {
        for (key, value) in headers {
            let expanded_value = interpolate(&value, &vars);
            req_builder = req_builder.header(&key, &expanded_value);
        }
    }

    // Merge auth query params then request query params (request takes precedence)
    let mut all_query_params: HashMap<String, String> = auth_query_params;
    if let Some(params) = request.query_params {
        for (k, v) in params {
            all_query_params.insert(k, interpolate(&v, &vars));
        }
    }
    if !all_query_params.is_empty() {
        req_builder = req_builder.query(&all_query_params);
    }

    if let Some(body) = request.body {
        let expanded_body = interpolate(&body, &vars);
        req_builder = req_builder.body(expanded_body);
    }

    let response = req_builder.send().await.map_err(|err| {
        if err.is_timeout() {
            AppError::Timeout(timeout_ms)
        } else {
            AppError::from(err)
        }
    })?;

    let status = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let mut headers = HashMap::new();
    let mut content_type = String::new();
    for (key, value) in response.headers() {
        if let Ok(v) = value.to_str() {
            if key.as_str().eq_ignore_ascii_case("content-type") {
                content_type = v.to_string();
            }
            headers.insert(key.to_string(), v.to_string());
        }
    }

    let body_bytes = response.bytes().await.map_err(AppError::from)?;
    let body_size_bytes = body_bytes.len() as u64;
    let body = String::from_utf8_lossy(&body_bytes).into_owned();
    let response_time_ms = start.elapsed().as_millis() as u64;

    let body_looks_like_json = body.trim_start().starts_with('{') || body.trim_start().starts_with('[');
    let is_json = content_type.contains("application/json")
        || content_type.contains("application/ld+json")
        || (content_type.is_empty() && body_looks_like_json);

    Ok(RestResponse {
        status,
        status_text,
        headers,
        body,
        response_time_ms,
        body_size_bytes,
        is_json,
    })
}
