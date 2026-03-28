use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::storage::DbState;

// ─── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

// ─── Workspace CRUD ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_workspace(
    state: State<'_, DbState>,
    name: String,
) -> Result<Workspace, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let id = Uuid::new_v4().to_string();
    let now = epoch_now();

    conn.execute(
        "INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, name, now, now],
    )?;

    Ok(Workspace {
        id,
        name,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn list_workspaces(
    state: State<'_, DbState>,
) -> Result<Vec<Workspace>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let mut stmt = conn.prepare(
        "SELECT id, name, created_at, updated_at FROM workspaces ORDER BY created_at ASC",
    )?;
    let workspaces = stmt.query_map([], row_to_workspace)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(workspaces)
}

#[tauri::command]
pub async fn get_workspace(
    state: State<'_, DbState>,
    id: String,
) -> Result<Workspace, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let workspace = conn.query_row(
        "SELECT id, name, created_at, updated_at FROM workspaces WHERE id = ?1",
        rusqlite::params![id],
        row_to_workspace,
    ).map_err(|_| AppError::Custom("Workspace not found".into()))?;
    Ok(workspace)
}

#[tauri::command]
pub async fn delete_workspace(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    conn.execute("DELETE FROM workspaces WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn row_to_workspace(row: &rusqlite::Row<'_>) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        id: row.get(0)?,
        name: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

fn epoch_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}
