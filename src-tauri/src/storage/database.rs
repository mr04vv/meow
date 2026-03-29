use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::error::AppResult;

#[allow(dead_code)]
pub struct DbState(pub Mutex<Connection>);

const MIGRATIONS: &str = r#"
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    name TEXT NOT NULL,
    parent_id TEXT,
    spec_path TEXT,
    auth_type TEXT,
    auth_config TEXT DEFAULT '{}',
    active_environment_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_environments (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_variable_keys (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    key TEXT NOT NULL,
    is_secret INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_variable_values (
    id TEXT PRIMARY KEY,
    variable_key_id TEXT NOT NULL,
    environment_id TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (variable_key_id) REFERENCES collection_variable_keys(id) ON DELETE CASCADE,
    FOREIGN KEY (environment_id) REFERENCES collection_environments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    collection_id TEXT,
    name TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    headers TEXT NOT NULL DEFAULT '{}',
    query_params TEXT NOT NULL DEFAULT '{}',
    body TEXT,
    auth_type TEXT,
    auth_config TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

-- Track which OpenAPI operation generated each request (used for resync diff detection)
CREATE TABLE IF NOT EXISTS request_openapi_meta (
    request_id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL,
    spec_fingerprint TEXT NOT NULL,
    user_edited INTEGER NOT NULL DEFAULT 0,
    openapi_docs TEXT,
    FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cognito_tokens (
    collection_id TEXT PRIMARY KEY,
    id_token TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS github_auth (
    id TEXT PRIMARY KEY DEFAULT 'default',
    access_token TEXT NOT NULL,
    username TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL
);
"#;

pub fn init_database(app: &AppHandle) -> AppResult<Connection> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::Custom(e.to_string()))?;

    std::fs::create_dir_all(&app_data_dir)?;

    let db_path = app_data_dir.join("meow.db");
    let conn = Connection::open(&db_path)?;

    conn.execute_batch(MIGRATIONS)?;

    log::info!("Database initialized at: {:?}", db_path);

    Ok(conn)
}
