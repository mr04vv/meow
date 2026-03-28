use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::storage::DbState;

// ─── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct Variable {
    pub id: String,
    pub environment_id: String,
    pub key: String,
    pub value: String,
    pub is_secret: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateEnvironmentRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEnvironmentRequest {
    pub id: String,
    pub name: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertVariableRequest {
    pub environment_id: String,
    pub key: String,
    pub value: String,
    pub is_secret: Option<bool>,
}

// ─── Environment CRUD ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_environment(
    state: State<'_, DbState>,
    request: CreateEnvironmentRequest,
) -> Result<Environment, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let id = Uuid::new_v4().to_string();
    let now = chrono_now();

    conn.execute(
        "INSERT INTO environments (id, name, is_active, created_at, updated_at) VALUES (?1, ?2, 0, ?3, ?4)",
        rusqlite::params![id, request.name, now, now],
    )?;

    Ok(Environment {
        id,
        name: request.name,
        is_active: false,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn list_environments(
    state: State<'_, DbState>,
) -> Result<Vec<Environment>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let mut stmt = conn.prepare(
        "SELECT id, name, is_active, created_at, updated_at FROM environments ORDER BY created_at ASC",
    )?;

    let envs = stmt.query_map([], |row| {
        Ok(Environment {
            id: row.get(0)?,
            name: row.get(1)?,
            is_active: row.get::<_, i64>(2)? != 0,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;

    Ok(envs)
}

#[tauri::command]
pub async fn update_environment(
    state: State<'_, DbState>,
    request: UpdateEnvironmentRequest,
) -> Result<Environment, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let now = chrono_now();

    if let Some(name) = &request.name {
        conn.execute(
            "UPDATE environments SET name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![name, now, request.id],
        )?;
    }

    if let Some(is_active) = request.is_active {
        if is_active {
            // Deactivate all others first
            conn.execute("UPDATE environments SET is_active = 0", [])?;
        }
        conn.execute(
            "UPDATE environments SET is_active = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![is_active as i64, now, request.id],
        )?;
    }

    let env = conn.query_row(
        "SELECT id, name, is_active, created_at, updated_at FROM environments WHERE id = ?1",
        rusqlite::params![request.id],
        |row| {
            Ok(Environment {
                id: row.get(0)?,
                name: row.get(1)?,
                is_active: row.get::<_, i64>(2)? != 0,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )?;

    Ok(env)
}

#[tauri::command]
pub async fn delete_environment(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    conn.execute("DELETE FROM variables WHERE environment_id = ?1", rusqlite::params![id])?;
    conn.execute("DELETE FROM environments WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

// ─── Variable CRUD ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_variables(
    state: State<'_, DbState>,
    environment_id: String,
) -> Result<Vec<Variable>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let mut stmt = conn.prepare(
        "SELECT id, environment_id, key, value, is_secret FROM variables WHERE environment_id = ?1",
    )?;

    let vars = stmt.query_map(rusqlite::params![environment_id], |row| {
        Ok(Variable {
            id: row.get(0)?,
            environment_id: row.get(1)?,
            key: row.get(2)?,
            value: row.get(3)?,
            is_secret: row.get::<_, i64>(4)? != 0,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;

    Ok(vars)
}

#[tauri::command]
pub async fn upsert_variable(
    state: State<'_, DbState>,
    request: UpsertVariableRequest,
) -> Result<Variable, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;

    // Check if variable with same key already exists in this environment
    let existing_id: Option<String> = conn.query_row(
        "SELECT id FROM variables WHERE environment_id = ?1 AND key = ?2",
        rusqlite::params![request.environment_id, request.key],
        |row| row.get(0),
    ).ok();

    let is_secret = request.is_secret.unwrap_or(false);

    let id = if let Some(existing_id) = existing_id {
        conn.execute(
            "UPDATE variables SET value = ?1, is_secret = ?2 WHERE id = ?3",
            rusqlite::params![request.value, is_secret as i64, existing_id],
        )?;
        existing_id
    } else {
        let new_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO variables (id, environment_id, key, value, is_secret) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![new_id, request.environment_id, request.key, request.value, is_secret as i64],
        )?;
        new_id
    };

    Ok(Variable {
        id,
        environment_id: request.environment_id,
        key: request.key,
        value: request.value,
        is_secret,
    })
}

#[tauri::command]
pub async fn delete_variable(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    conn.execute("DELETE FROM variables WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

// ─── Variable expansion ──────────────────────────────────────────────────────

/// Expand {{variable}} placeholders using the active environment's variables.
/// Unresolved placeholders are left as-is.
#[tauri::command]
pub async fn expand_variables(
    state: State<'_, DbState>,
    text: String,
) -> Result<String, AppError> {
    let vars = load_active_variables(&state)?;
    Ok(interpolate(&text, &vars))
}

/// Load variables from the currently active environment (internal helper)
pub fn load_active_variables(state: &State<'_, DbState>) -> AppResult<std::collections::HashMap<String, String>> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;

    let env_id: Option<String> = conn.query_row(
        "SELECT id FROM environments WHERE is_active = 1 LIMIT 1",
        [],
        |row| row.get(0),
    ).ok();

    let mut map = std::collections::HashMap::new();

    if let Some(env_id) = env_id {
        let mut stmt = conn.prepare(
            "SELECT key, value FROM variables WHERE environment_id = ?1",
        )?;
        let pairs = stmt.query_map(rusqlite::params![env_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for pair in pairs {
            let (k, v) = pair?;
            map.insert(k, v);
        }
    }

    Ok(map)
}

/// Replace {{key}} patterns with values from the map
pub fn interpolate(text: &str, vars: &std::collections::HashMap<String, String>) -> String {
    let mut result = text.to_string();
    for (key, value) in vars {
        let placeholder = format!("{{{{{}}}}}", key);
        result = result.replace(&placeholder, value);
    }
    result
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // ISO-8601-like: seconds since epoch formatted as RFC3339 approximation
    // For simplicity use a numeric timestamp string; full RFC3339 would require chrono crate
    format!("{}", secs)
}
