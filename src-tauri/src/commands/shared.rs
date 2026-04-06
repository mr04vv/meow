use std::collections::HashMap;

use crate::auth::AuthConfig;
use crate::commands::collection_env::load_active_collection_variables_inner;
use crate::error::AppError;

/// Build a variable map from the active environment of a collection
pub fn build_variable_map(
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

/// Replace `{{variable}}` placeholders in text with values from the variable map
pub fn interpolate(text: &str, vars: &HashMap<String, String>) -> String {
    let mut result = text.to_string();
    for (key, value) in vars {
        let placeholder = format!("{{{{{}}}}}", key);
        result = result.replace(&placeholder, value);
    }
    result
}

/// Auth info resolved from DB (sync — no network calls)
pub struct ResolvedAuth {
    pub headers: HashMap<String, String>,
    pub query_params: HashMap<String, String>,
    pub cognito_config: Option<CognitoCredentials>,
}

pub struct CognitoCredentials {
    pub client_id: String,
    pub username: String,
    pub password: String,
    pub region: String,
}

/// Resolve auth by walking the parent chain from the given collection.
/// If `explicit_auth_type` and `explicit_auth_config` are provided, use them
/// instead of walking the collection chain.
pub fn resolve_auth_from_db(
    conn: &rusqlite::Connection,
    collection_id: Option<&str>,
    explicit_auth_type: Option<&str>,
    explicit_auth_config: Option<&str>,
    vars: &HashMap<String, String>,
) -> Result<ResolvedAuth, AppError> {
    // If explicit auth is provided, use it
    if let Some(auth_type) = explicit_auth_type {
        if auth_type != "none" {
            if let Some(auth_config_json) = explicit_auth_config {
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
    let Some(start_id) = collection_id else {
        return Ok(ResolvedAuth { headers: HashMap::new(), query_params: HashMap::new(), cognito_config: None });
    };

    let mut current_id = start_id.to_string();
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
