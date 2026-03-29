use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::storage::DbState;

// ─── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct CollectionEnvironment {
    pub id: String,
    pub collection_id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VariableKey {
    pub id: String,
    pub collection_id: String,
    pub key: String,
    pub is_secret: bool,
}

#[derive(Debug, Serialize)]
pub struct VariableWithValue {
    pub key_id: String,
    pub key: String,
    pub value: String,
    pub is_secret: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CollectionAuth {
    pub auth_type: Option<String>,
    pub auth_config: Option<String>,
}

// ─── Environment CRUD ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_collection_environment(
    state: State<'_, DbState>,
    collection_id: String,
    name: String,
) -> Result<CollectionEnvironment, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let id = Uuid::new_v4().to_string();
    let now = epoch_now();

    conn.execute(
        "INSERT INTO collection_environments (id, collection_id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, collection_id, name, now, now],
    )?;

    Ok(CollectionEnvironment {
        id,
        collection_id,
        name,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn list_collection_environments(
    state: State<'_, DbState>,
    collection_id: String,
) -> Result<Vec<CollectionEnvironment>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let mut stmt = conn.prepare(
        "SELECT id, collection_id, name, created_at, updated_at FROM collection_environments WHERE collection_id = ?1 ORDER BY created_at ASC",
    )?;
    let envs = stmt.query_map(rusqlite::params![collection_id], |row| {
        Ok(CollectionEnvironment {
            id: row.get(0)?,
            collection_id: row.get(1)?,
            name: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(envs)
}

#[tauri::command]
pub async fn set_active_collection_environment(
    state: State<'_, DbState>,
    collection_id: String,
    environment_id: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let now = epoch_now();
    conn.execute(
        "UPDATE collections SET active_environment_id = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![environment_id, now, collection_id],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn delete_collection_environment(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    conn.execute("DELETE FROM collection_environments WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

// ─── Variable Keys CRUD ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_variable_keys(
    state: State<'_, DbState>,
    collection_id: String,
) -> Result<Vec<VariableKey>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let mut stmt = conn.prepare(
        "SELECT id, collection_id, key, is_secret FROM collection_variable_keys WHERE collection_id = ?1 ORDER BY sort_order ASC",
    )?;
    let keys = stmt.query_map(rusqlite::params![collection_id], |row| {
        Ok(VariableKey {
            id: row.get(0)?,
            collection_id: row.get(1)?,
            key: row.get(2)?,
            is_secret: row.get::<_, i64>(3)? != 0,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(keys)
}

#[tauri::command]
pub async fn create_variable_key(
    state: State<'_, DbState>,
    collection_id: String,
    key: String,
    is_secret: bool,
) -> Result<VariableKey, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let id = Uuid::new_v4().to_string();

    let sort_order: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM collection_variable_keys WHERE collection_id = ?1",
        rusqlite::params![collection_id],
        |row| row.get(0),
    ).unwrap_or(0);

    conn.execute(
        "INSERT INTO collection_variable_keys (id, collection_id, key, is_secret, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, collection_id, key, is_secret as i64, sort_order],
    )?;

    Ok(VariableKey {
        id,
        collection_id,
        key,
        is_secret,
    })
}

#[tauri::command]
pub async fn delete_variable_key(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    conn.execute("DELETE FROM collection_variable_keys WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

#[tauri::command]
pub async fn get_variables_for_env(
    state: State<'_, DbState>,
    collection_id: String,
    environment_id: String,
) -> Result<Vec<VariableWithValue>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let mut stmt = conn.prepare(
        "SELECT k.id, k.key, COALESCE(v.value, '') as value, k.is_secret \
         FROM collection_variable_keys k \
         LEFT JOIN collection_variable_values v ON v.variable_key_id = k.id AND v.environment_id = ?1 \
         WHERE k.collection_id = ?2 \
         ORDER BY k.sort_order ASC",
    )?;
    let vars = stmt.query_map(rusqlite::params![environment_id, collection_id], |row| {
        Ok(VariableWithValue {
            key_id: row.get(0)?,
            key: row.get(1)?,
            value: row.get(2)?,
            is_secret: row.get::<_, i64>(3)? != 0,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(vars)
}

#[tauri::command]
pub async fn upsert_variable_value(
    state: State<'_, DbState>,
    variable_key_id: String,
    environment_id: String,
    value: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT OR REPLACE INTO collection_variable_values (id, variable_key_id, environment_id, value) \
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, variable_key_id, environment_id, value],
    )?;
    Ok(())
}

/// Get variables for the collection's active environment
#[tauri::command]
pub async fn get_active_collection_variables(
    state: State<'_, DbState>,
    collection_id: String,
) -> Result<Vec<VariableWithValue>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    load_active_collection_variables_inner(&conn, &collection_id)
}

/// Internal helper: load variables for the collection's active environment
pub fn load_active_collection_variables_inner(
    conn: &rusqlite::Connection,
    collection_id: &str,
) -> Result<Vec<VariableWithValue>, AppError> {
    // Walk up the parent chain to find the collection with an active environment
    let mut current_id = collection_id.to_string();
    let mut active_env_id: Option<String> = None;

    for _ in 0..10 {
        // Safety limit to prevent infinite loops
        let row: Option<(Option<String>, Option<String>)> = conn.query_row(
            "SELECT active_environment_id, parent_id FROM collections WHERE id = ?1",
            rusqlite::params![current_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).ok();

        let Some((env_id, parent_id)) = row else {
            break;
        };

        if env_id.is_some() {
            active_env_id = env_id;
            break;
        }

        // No active env on this collection, try parent
        let Some(pid) = parent_id else {
            break;
        };
        current_id = pid;
    }

    let Some(env_id) = active_env_id else {
        return Ok(vec![]);
    };

    let mut stmt = conn.prepare(
        "SELECT k.key, COALESCE(v.value, '') as value, k.is_secret \
         FROM collection_variable_keys k \
         LEFT JOIN collection_variable_values v ON v.variable_key_id = k.id AND v.environment_id = ?1 \
         WHERE k.collection_id = ?2",
    )?;
    let vars = stmt.query_map(rusqlite::params![env_id, current_id], |row| {
        Ok(VariableWithValue {
            key_id: String::new(),
            key: row.get(0)?,
            value: row.get(1)?,
            is_secret: row.get::<_, i64>(2)? != 0,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(vars)
}

// ─── Auth CRUD ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn update_collection_auth(
    state: State<'_, DbState>,
    collection_id: String,
    auth_type: Option<String>,
    auth_config: Option<String>,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let now = epoch_now();
    conn.execute(
        "UPDATE collections SET auth_type = ?1, auth_config = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![auth_type, auth_config, now, collection_id],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn get_collection_auth(
    state: State<'_, DbState>,
    collection_id: String,
) -> Result<CollectionAuth, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let auth = conn.query_row(
        "SELECT auth_type, auth_config FROM collections WHERE id = ?1",
        rusqlite::params![collection_id],
        |row| {
            Ok(CollectionAuth {
                auth_type: row.get(0)?,
                auth_config: row.get(1)?,
            })
        },
    ).map_err(|_| AppError::Custom("Collection not found".into()))?;
    Ok(auth)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn epoch_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}
