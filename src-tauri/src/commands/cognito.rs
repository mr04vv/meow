use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

use crate::error::AppError;
use crate::storage::DbState;

#[derive(Debug, Serialize, Clone)]
pub struct CognitoTokens {
    pub id_token: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
}

// Cognito InitiateAuth HTTP response shape
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InitiateAuthResponse {
    authentication_result: Option<AuthenticationResult>,
    challenge_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct AuthenticationResult {
    id_token: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct CognitoErrorResponse {
    message: Option<String>,
    #[serde(rename = "__type")]
    error_type: Option<String>,
}

fn cognito_endpoint(region: &str) -> String {
    format!(
        "https://cognito-idp.{}.amazonaws.com/",
        region
    )
}

async fn call_initiate_auth(
    region: &str,
    target: &str,
    body: &HashMap<&str, serde_json::Value>,
) -> Result<InitiateAuthResponse, AppError> {
    let client = reqwest::Client::new();
    let endpoint = cognito_endpoint(region);

    let resp = client
        .post(&endpoint)
        .header("Content-Type", "application/x-amz-json-1.1")
        .header("X-Amz-Target", format!("AWSCognitoIdentityProviderService.{}", target))
        .json(body)
        .send()
        .await
        .map_err(AppError::from)?;

    if !resp.status().is_success() {
        let err: CognitoErrorResponse = resp.json().await.unwrap_or(CognitoErrorResponse {
            message: Some("Unknown error".into()),
            error_type: None,
        });
        let msg = err.message.unwrap_or_else(|| "Cognito request failed".into());
        let kind = err.error_type.unwrap_or_default();
        return Err(AppError::Custom(format!("Cognito error [{}]: {}", kind, msg)));
    }

    resp.json::<InitiateAuthResponse>()
        .await
        .map_err(|e| AppError::Custom(format!("Failed to parse Cognito response: {}", e)))
}

fn save_tokens_to_db(
    conn: &rusqlite::Connection,
    collection_id: &str,
    tokens: &CognitoTokens,
) -> Result<(), AppError> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let expires_at = (now_secs + tokens.expires_in).to_string();

    conn.execute(
        "INSERT INTO cognito_tokens (collection_id, id_token, access_token, refresh_token, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(collection_id) DO UPDATE SET
             id_token=excluded.id_token,
             access_token=excluded.access_token,
             refresh_token=excluded.refresh_token,
             expires_at=excluded.expires_at",
        rusqlite::params![
            collection_id,
            tokens.id_token,
            tokens.access_token,
            tokens.refresh_token,
            expires_at
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn cognito_authenticate(
    state: State<'_, DbState>,
    collection_id: Option<String>,
    client_id: String,
    username: String,
    password: String,
    region: String,
) -> Result<CognitoTokens, AppError> {

    let mut auth_params = HashMap::new();
    auth_params.insert("USERNAME", serde_json::Value::String(username));
    auth_params.insert("PASSWORD", serde_json::Value::String(password));

    let mut body = HashMap::new();
    body.insert("AuthFlow", serde_json::json!("USER_PASSWORD_AUTH"));
    body.insert("ClientId", serde_json::json!(client_id));
    body.insert("AuthParameters", serde_json::json!(auth_params));

    let resp = call_initiate_auth(&region, "InitiateAuth", &body).await?;

    if let Some(challenge) = resp.challenge_name {
        return Err(AppError::Custom(format!(
            "Cognito challenge required: {}. Complete the challenge before authenticating.",
            challenge
        )));
    }

    let result = resp
        .authentication_result
        .ok_or_else(|| AppError::Custom("No authentication result returned".into()))?;

    let tokens = CognitoTokens {
        id_token: result.id_token.unwrap_or_default(),
        access_token: result.access_token.unwrap_or_default(),
        refresh_token: result.refresh_token,
        expires_in: result.expires_in.unwrap_or(3600),
    };

    if let Some(cid) = &collection_id {
        let conn = state
            .0
            .lock()
            .map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        save_tokens_to_db(&conn, cid, &tokens)?;
    }

    Ok(tokens)
}

#[tauri::command]
pub async fn cognito_refresh_token(
    state: State<'_, DbState>,
    collection_id: Option<String>,
    client_id: String,
    refresh_token: String,
    region: String,
) -> Result<CognitoTokens, AppError> {
    let mut auth_params = HashMap::new();
    auth_params.insert("REFRESH_TOKEN", serde_json::Value::String(refresh_token.clone()));

    let mut body = HashMap::new();
    body.insert("AuthFlow", serde_json::json!("REFRESH_TOKEN_AUTH"));
    body.insert("ClientId", serde_json::json!(client_id));
    body.insert("AuthParameters", serde_json::json!(auth_params));

    let resp = call_initiate_auth(&region, "InitiateAuth", &body).await?;

    let result = resp
        .authentication_result
        .ok_or_else(|| AppError::Custom("No authentication result returned".into()))?;

    let tokens = CognitoTokens {
        id_token: result.id_token.unwrap_or_default(),
        access_token: result.access_token.unwrap_or_default(),
        // Refresh responses don't always return a new refresh token; keep the original
        refresh_token: result.refresh_token.or(Some(refresh_token)),
        expires_in: result.expires_in.unwrap_or(3600),
    };

    if let Some(cid) = &collection_id {
        let conn = state
            .0
            .lock()
            .map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        save_tokens_to_db(&conn, cid, &tokens)?;
    }

    Ok(tokens)
}

#[tauri::command]
pub async fn cognito_get_stored_token(
    state: State<'_, DbState>,
    collection_id: String,
) -> Result<Option<CognitoTokens>, AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Custom("DB lock poisoned".into()))?;

    let result = conn.query_row(
        "SELECT id_token, access_token, refresh_token, expires_at FROM cognito_tokens WHERE collection_id = ?1",
        rusqlite::params![collection_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
            ))
        },
    );

    match result {
        Ok((id_token, access_token, refresh_token, expires_at)) => {
            use std::time::{SystemTime, UNIX_EPOCH};
            let expires_at_secs: i64 = expires_at.parse().unwrap_or(0);
            let now_secs = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            let expires_in = (expires_at_secs - now_secs).max(0);

            Ok(Some(CognitoTokens {
                id_token,
                access_token,
                refresh_token,
                expires_in,
            }))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}
