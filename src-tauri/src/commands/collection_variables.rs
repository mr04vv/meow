use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::storage::DbState;

// ─── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct CollectionVariable {
    pub id: String,
    pub collection_id: String,
    pub key: String,
    pub value: String,
    pub is_secret: bool,
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_collection_variables(
    state: State<'_, DbState>,
    collection_id: String,
) -> Result<Vec<CollectionVariable>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let mut stmt = conn.prepare(
        "SELECT id, collection_id, key, value, is_secret FROM collection_variables WHERE collection_id = ?1",
    )?;

    let vars = stmt.query_map(rusqlite::params![collection_id], |row| {
        Ok(CollectionVariable {
            id: row.get(0)?,
            collection_id: row.get(1)?,
            key: row.get(2)?,
            value: row.get(3)?,
            is_secret: row.get::<_, i64>(4)? != 0,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;

    Ok(vars)
}

#[tauri::command]
pub async fn upsert_collection_variable(
    state: State<'_, DbState>,
    collection_id: String,
    key: String,
    value: String,
    is_secret: bool,
    id: Option<String>,
) -> Result<CollectionVariable, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;

    let var_id = if let Some(existing_id) = id {
        // Update by explicit ID
        conn.execute(
            "UPDATE collection_variables SET key = ?1, value = ?2, is_secret = ?3 WHERE id = ?4",
            rusqlite::params![key, value, is_secret as i64, existing_id],
        )?;
        existing_id
    } else {
        // Check if a variable with the same key already exists in this collection
        let existing_id: Option<String> = conn.query_row(
            "SELECT id FROM collection_variables WHERE collection_id = ?1 AND key = ?2",
            rusqlite::params![collection_id, key],
            |row| row.get(0),
        ).ok();

        if let Some(eid) = existing_id {
            conn.execute(
                "UPDATE collection_variables SET value = ?1, is_secret = ?2 WHERE id = ?3",
                rusqlite::params![value, is_secret as i64, eid],
            )?;
            eid
        } else {
            let new_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO collection_variables (id, collection_id, key, value, is_secret) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![new_id, collection_id, key, value, is_secret as i64],
            )?;
            new_id
        }
    };

    Ok(CollectionVariable {
        id: var_id,
        collection_id,
        key,
        value,
        is_secret,
    })
}

#[tauri::command]
pub async fn delete_collection_variable(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    conn.execute("DELETE FROM collection_variables WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

/// Get all variables for a collection including inherited ones from parent.
/// Child variables override parent variables with the same key.
#[tauri::command]
pub async fn get_inherited_variables(
    state: State<'_, DbState>,
    collection_id: String,
) -> Result<Vec<CollectionVariable>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let merged = load_inherited_variables_inner(&conn, &collection_id)?;
    Ok(merged.into_values().collect())
}

/// Internal helper: load merged variables for a collection, walking up the parent chain.
/// Returns a HashMap keyed by variable key; child values win over parent values.
pub fn load_inherited_variables_inner(
    conn: &rusqlite::Connection,
    collection_id: &str,
) -> Result<HashMap<String, CollectionVariable>, AppError> {
    // Walk the parent chain bottom-up, collecting (collection_id, parent_id) pairs
    let mut chain: Vec<String> = Vec::new();
    let mut current_id = collection_id.to_string();

    loop {
        chain.push(current_id.clone());
        let parent_id: Option<String> = conn.query_row(
            "SELECT parent_id FROM collections WHERE id = ?1",
            rusqlite::params![current_id],
            |row| row.get(0),
        ).ok().flatten();

        match parent_id {
            Some(pid) => current_id = pid,
            None => break,
        }
    }

    // Process from root to leaf so child entries overwrite parent entries
    chain.reverse();

    let mut merged: HashMap<String, CollectionVariable> = HashMap::new();

    for cid in chain {
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, key, value, is_secret FROM collection_variables WHERE collection_id = ?1",
        )?;
        let vars = stmt.query_map(rusqlite::params![cid], |row| {
            Ok(CollectionVariable {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                key: row.get(2)?,
                value: row.get(3)?,
                is_secret: row.get::<_, i64>(4)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

        for var in vars {
            merged.insert(var.key.clone(), var);
        }
    }

    Ok(merged)
}
