use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::error::AppResult;

#[allow(dead_code)]
pub struct DbState(pub Mutex<Connection>);

/// Each migration has a version number and SQL to execute.
/// Migrations are applied in order, skipping any already applied.
struct Migration {
    version: u32,
    description: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "Initial schema",
        sql: r#"
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

CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#,
    },
    // Future migrations go here:
    // Migration {
    //     version: 2,
    //     description: "Add some_new_column to collections",
    //     sql: "ALTER TABLE collections ADD COLUMN some_new_column TEXT;",
    // },
];

pub fn init_database(app: &AppHandle) -> AppResult<Connection> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::Custom(e.to_string()))?;

    std::fs::create_dir_all(&app_data_dir)?;

    let db_path = app_data_dir.join("meow.db");
    let conn = Connection::open(&db_path)?;

    // Ensure migrations tracking table exists (bootstrap)
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
    )?;

    // Get current schema version
    let current_version: u32 = conn
        .query_row(
            "SELECT value FROM app_config WHERE key = 'schema_version'",
            [],
            |row| {
                let val: String = row.get(0)?;
                Ok(val.parse::<u32>().unwrap_or(0))
            },
        )
        .unwrap_or(0);

    // Apply pending migrations
    for migration in MIGRATIONS {
        if migration.version > current_version {
            log::info!(
                "Applying migration v{}: {}",
                migration.version,
                migration.description
            );
            conn.execute_batch(migration.sql)?;

            // Update schema version
            conn.execute(
                "INSERT OR REPLACE INTO app_config (key, value) VALUES ('schema_version', ?1)",
                rusqlite::params![migration.version.to_string()],
            )?;
        }
    }

    // Initialize encryption key if not exists
    let has_key: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM app_config WHERE key = 'encryption_key'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .unwrap_or(false);

    if !has_key {
        let key = crate::crypto::generate_key();
        conn.execute(
            "INSERT INTO app_config (key, value) VALUES ('encryption_key', ?1)",
            rusqlite::params![key],
        )?;
    }

    log::info!(
        "Database initialized at: {:?} (schema v{})",
        db_path,
        MIGRATIONS.last().map(|m| m.version).unwrap_or(0)
    );

    Ok(conn)
}

/// Get the encryption key from the database
pub fn get_encryption_key(conn: &Connection) -> AppResult<String> {
    conn.query_row(
        "SELECT value FROM app_config WHERE key = 'encryption_key'",
        [],
        |row| row.get(0),
    )
    .map_err(|e| crate::error::AppError::Custom(format!("Encryption key not found: {}", e)))
}
