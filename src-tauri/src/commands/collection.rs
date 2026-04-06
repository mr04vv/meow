use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

use crate::error::AppError;
use crate::storage::DbState;

// ─── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GenerateCollectionRequest {
    /// The parsed OpenAPI spec (from parse_openapi command)
    pub spec: ParsedOpenApiInput,
    /// ID of the workspace to associate the collection with
    pub workspace_id: Option<String>,
    /// ID of the parent collection to nest under (None = top-level)
    pub parent_collection_id: Option<String>,
    /// Base URL to use for requests (overrides spec servers if provided)
    pub base_url: Option<String>,
    /// If true, resync an existing collection instead of creating new
    pub collection_id: Option<String>,
}

/// Mirrors ParsedOpenApi but as Deserialize for input
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ParsedOpenApiInput {
    pub version: String,
    pub title: String,
    pub description: Option<String>,
    pub servers: Vec<ServerInfoInput>,
    pub paths: Vec<PathInfoInput>,
    pub schemas: HashMap<String, Value>,
    pub security_schemes: HashMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ServerInfoInput {
    pub url: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PathInfoInput {
    pub path: String,
    pub operations: Vec<OperationInfoInput>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OperationInfoInput {
    pub method: String,
    pub operation_id: Option<String>,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub parameters: Vec<Value>,
    pub request_body: Option<Value>,
    pub responses: HashMap<String, Value>,
    pub security: Vec<Value>,
}

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub root_collection_id: String,
    pub tag_collections: Vec<TagCollectionResult>,
    pub requests_created: u32,
    pub requests_updated: u32,
    pub requests_skipped: u32,
    pub requests_removed: u32,
}

#[derive(Debug, Serialize)]
pub struct TagCollectionResult {
    pub tag: String,
    pub collection_id: String,
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Generate a Collection from a parsed OpenAPI spec, creating tag-based sub-collections
/// and request templates with example values auto-inserted.
///
/// Behavior based on `collection_id` in the request:
/// - If provided: create a subfolder inside that existing collection for this spec's tags/requests
/// - If not provided: create a new root collection, then subfolders inside it
///
/// For resync of an existing root collection (not subfolder mode), also pass `collection_id`
/// at the top level (the existing logic still applies for tag-level sub-collections).
#[tauri::command]
pub async fn generate_collection_from_openapi(
    state: State<'_, DbState>,
    request: GenerateCollectionRequest,
) -> Result<SyncResult, AppError> {
    let base_url = request
        .base_url
        .or_else(|| request.spec.servers.first().map(|s| s.url.clone()))
        .unwrap_or_else(|| "{{BASE_URL}}".to_string());

    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let now = epoch_now();

    // Derive a subfolder name from the spec title or filename
    let subfolder_name = request.spec.title.clone();

    // ── 1. Ensure root collection ────────────────────────────────────────────
    // If collection_id is provided, we add a subfolder inside that collection for this spec.
    // The subfolder name is derived from the spec title.
    let root_id = if let Some(parent_id) = &request.collection_id {
        // Check if a subfolder with this spec title already exists under the given collection
        let existing: Option<String> = conn.query_row(
            "SELECT id FROM collections WHERE parent_id = ?1 AND name = ?2",
            rusqlite::params![parent_id, subfolder_name],
            |row| row.get(0),
        ).ok();

        if let Some(existing_id) = existing {
            // Update metadata for the existing subfolder
            conn.execute(
                "UPDATE collections SET updated_at=?1 WHERE id=?2",
                rusqlite::params![now, existing_id],
            )?;
            existing_id
        } else {
            // Create a new subfolder under the given collection
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO collections (id, workspace_id, name, parent_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![id, request.workspace_id, subfolder_name, parent_id, now, now],
            )?;
            id
        }
    } else {
        // No collection_id provided — create a new root collection
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO collections (id, workspace_id, name, parent_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![id, request.workspace_id, request.spec.title, request.parent_collection_id, now, now],
        )?;
        id
    };

    // ── 2. Collect all operations ──────────────────────────────────────────────
    // All requests go directly into root_id (no tag-based sub-collections)
    let mut all_operations: Vec<(&PathInfoInput, &OperationInfoInput)> = Vec::new();

    for path_info in &request.spec.paths {
        for op in &path_info.operations {
            all_operations.push((path_info, op));
        }
    }

    let tag_collections_result: Vec<TagCollectionResult> = vec![TagCollectionResult {
        tag: "default".to_string(),
        collection_id: root_id.clone(),
    }];

    // ── 4. Build the set of current operation IDs in the spec ─────────────────
    let mut spec_operation_ids: Vec<String> = Vec::new();
    for path_info in &request.spec.paths {
        for op in &path_info.operations {
            let op_id = derive_operation_id(op, &path_info.path);
            spec_operation_ids.push(op_id);
        }
    }

    // ── 5. Load existing synced requests for this root collection ─────────────
    // We track them via request_openapi_meta joined on collection hierarchy
    let mut existing_meta: HashMap<String, ExistingMeta> = HashMap::new();
    {
        let mut stmt = conn.prepare(
            "SELECT m.operation_id, m.spec_fingerprint, m.user_edited, r.id
             FROM request_openapi_meta m
             JOIN requests r ON r.id = m.request_id
             WHERE r.collection_id IN (
                 SELECT id FROM collections WHERE id = ?1 OR parent_id = ?1
             )",
        )?;
        let x = stmt.query_map(rusqlite::params![root_id], |row| {
            Ok(ExistingMeta {
                operation_id: row.get(0)?,
                spec_fingerprint: row.get(1)?,
                user_edited: row.get::<_, i64>(2)? != 0,
                request_id: row.get(3)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        for meta in x {
            existing_meta.insert(meta.operation_id.clone(), meta);
        }
    }

    // ── 6. Upsert requests per operation ──────────────────────────────────────
    let mut requests_created: u32 = 0;
    let mut requests_updated: u32 = 0;
    let mut requests_skipped: u32 = 0;

    {
        let collection_id = root_id.clone();

        for (sort_idx, (path_info, op)) in all_operations.iter().enumerate() {
            let op_id = derive_operation_id(op, &path_info.path);
            let fingerprint = compute_fingerprint(op, &path_info.path);
            let request_name = derive_request_name(op, &path_info.path);
            let url = build_url(&base_url, &path_info.path);
            let (query_params, mut headers) = extract_params(&op.parameters, &request.spec.schemas);
            let body = extract_body(&op.request_body, &request.spec.schemas);

            // Add Content-Type header when request body exists
            if body.is_some() && !headers.contains_key("Content-Type") {
                headers.insert("Content-Type".to_string(), "application/json".to_string());
            }

            let headers_json = serde_json::to_string(&headers)?;
            let query_params_json = serde_json::to_string(&query_params)?;

            if let Some(meta) = existing_meta.get(&op_id) {
                if meta.user_edited {
                    // User has modified this request — never overwrite
                    requests_skipped += 1;
                    continue;
                }

                if meta.spec_fingerprint == fingerprint {
                    // Spec unchanged — nothing to do
                    requests_skipped += 1;
                    continue;
                }

                let docs = serde_json::json!({
                    "summary": op.summary,
                    "description": op.description,
                    "parameters": op.parameters,
                    "request_body": op.request_body,
                    "responses": op.responses,
                    "security": op.security,
                    "path": path_info.path,
                    "method": op.method,
                    "schemas": request.spec.schemas,
                });
                let docs_json = serde_json::to_string(&docs).ok();

                // Spec changed and not user-edited — update
                conn.execute(
                    "UPDATE requests SET collection_id=?1, name=?2, method=?3, url=?4, headers=?5, query_params=?6, body=?7, sort_order=?8, updated_at=?9 WHERE id=?10",
                    rusqlite::params![
                        collection_id, request_name, op.method, url,
                        headers_json, query_params_json, body,
                        sort_idx as i64, now, meta.request_id
                    ],
                )?;
                conn.execute(
                    "UPDATE request_openapi_meta SET spec_fingerprint=?1, openapi_docs=?2 WHERE request_id=?3",
                    rusqlite::params![fingerprint, docs_json, meta.request_id],
                )?;
                requests_updated += 1;
            } else {
                let docs = serde_json::json!({
                    "summary": op.summary,
                    "description": op.description,
                    "parameters": op.parameters,
                    "request_body": op.request_body,
                    "responses": op.responses,
                    "security": op.security,
                    "path": path_info.path,
                    "method": op.method,
                    "schemas": request.spec.schemas,
                });
                let docs_json = serde_json::to_string(&docs).ok();

                // New operation — create request
                let req_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO requests (id, collection_id, name, method, url, headers, query_params, body, sort_order, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    rusqlite::params![
                        req_id, collection_id, request_name, op.method, url,
                        headers_json, query_params_json, body,
                        sort_idx as i64, now, now
                    ],
                )?;
                conn.execute(
                    "INSERT INTO request_openapi_meta (request_id, operation_id, spec_fingerprint, user_edited, openapi_docs) VALUES (?1, ?2, ?3, 0, ?4)",
                    rusqlite::params![req_id, op_id, fingerprint, docs_json],
                )?;
                requests_created += 1;
            }
        }
    }

    // ── 7. Remove requests for operations no longer in the spec ───────────────
    let mut requests_removed: u32 = 0;
    for (op_id, meta) in &existing_meta {
        if !spec_operation_ids.contains(op_id) && !meta.user_edited {
            conn.execute("DELETE FROM requests WHERE id = ?1", rusqlite::params![meta.request_id])?;
            // Cascade deletes request_openapi_meta via ON DELETE CASCADE
            requests_removed += 1;
        }
    }

    Ok(SyncResult {
        root_collection_id: root_id,
        tag_collections: tag_collections_result,
        requests_created,
        requests_updated,
        requests_skipped,
        requests_removed,
    })
}

/// Mark a request as user-edited so resync will not overwrite it
#[tauri::command]
pub async fn mark_request_user_edited(
    state: State<'_, DbState>,
    request_id: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    conn.execute(
        "UPDATE request_openapi_meta SET user_edited = 1 WHERE request_id = ?1",
        rusqlite::params![request_id],
    )?;
    Ok(())
}

/// Create a new root collection under a workspace
#[tauri::command]
pub async fn create_collection(
    state: State<'_, DbState>,
    name: String,
    workspace_id: String,
) -> Result<CollectionInfo, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let id = Uuid::new_v4().to_string();
    let now = epoch_now();

    conn.execute(
        "INSERT INTO collections (id, workspace_id, name, parent_id, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5)",
        rusqlite::params![id, workspace_id, name, now, now],
    )?;

    Ok(CollectionInfo {
        id,
        workspace_id: Some(workspace_id),
        name,
        parent_id: None,
        spec_path: None,
        auth_type: None,
        auth_config: None,
        active_environment_id: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// List all collections (flat list with parent_id for tree reconstruction on FE)
#[tauri::command]
pub async fn list_collections(
    state: State<'_, DbState>,
    workspace_id: Option<String>,
) -> Result<Vec<CollectionInfo>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;

    let collections = if let Some(wid) = workspace_id {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, name, parent_id, spec_path, auth_type, auth_config, active_environment_id, created_at, updated_at FROM collections WHERE workspace_id = ?1 ORDER BY name ASC",
        )?;
        let x = stmt.query_map(rusqlite::params![wid], row_to_collection_info)?
            .collect::<Result<Vec<_>, _>>()?; x
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, name, parent_id, spec_path, auth_type, auth_config, active_environment_id, created_at, updated_at FROM collections ORDER BY name ASC",
        )?;
        let x = stmt.query_map([], row_to_collection_info)?
            .collect::<Result<Vec<_>, _>>()?; x
    };

    Ok(collections)
}

fn row_to_collection_info(row: &rusqlite::Row<'_>) -> rusqlite::Result<CollectionInfo> {
    Ok(CollectionInfo {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        name: row.get(2)?,
        parent_id: row.get(3)?,
        spec_path: row.get(4)?,
        auth_type: row.get(5)?,
        auth_config: row.get(6)?,
        active_environment_id: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

#[derive(Debug, Serialize)]
pub struct CollectionInfo {
    pub id: String,
    pub workspace_id: Option<String>,
    pub name: String,
    pub parent_id: Option<String>,
    pub spec_path: Option<String>,
    pub auth_type: Option<String>,
    pub auth_config: Option<String>,
    pub active_environment_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Delete a collection and all its child collections and requests
#[tauri::command]
pub async fn delete_collection(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    // Delete requests in this collection and all sub-collections
    conn.execute(
        "DELETE FROM requests WHERE collection_id IN (SELECT id FROM collections WHERE id = ?1 OR parent_id = ?1)",
        rusqlite::params![id],
    )?;
    // Delete sub-collections
    conn.execute("DELETE FROM collections WHERE parent_id = ?1", rusqlite::params![id])?;
    // Delete root collection
    conn.execute("DELETE FROM collections WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

struct ExistingMeta {
    operation_id: String,
    spec_fingerprint: String,
    user_edited: bool,
    request_id: String,
}

/// Derive a stable operation ID: prefer operationId, else "METHOD /path"
fn derive_operation_id(op: &OperationInfoInput, path: &str) -> String {
    op.operation_id
        .clone()
        .unwrap_or_else(|| format!("{} {}", op.method.to_uppercase(), path))
}

/// Compute a simple fingerprint for change detection: hash of method+path+params+body schema
fn compute_fingerprint(op: &OperationInfoInput, path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    op.method.hash(&mut hasher);
    path.hash(&mut hasher);
    op.parameters.len().hash(&mut hasher);
    if let Some(body) = &op.request_body {
        body.to_string().hash(&mut hasher);
    }
    format!("{:x}", hasher.finish())
}

/// Human-readable request name: prefer summary, else "METHOD /path"
fn derive_request_name(op: &OperationInfoInput, path: &str) -> String {
    op.summary
        .clone()
        .or_else(|| op.operation_id.clone())
        .unwrap_or_else(|| format!("{} {}", op.method.to_uppercase(), path))
}

/// Build the full URL by joining base_url with path
fn build_url(base_url: &str, path: &str) -> String {
    let base = base_url.trim_end_matches('/');
    let p = if path.starts_with('/') { path } else { &format!("/{}", path) };
    format!("{}{}", base, p)
}

/// Extract query parameters and headers from OpenAPI parameters, auto-filling examples
fn extract_params(
    parameters: &[Value],
    schemas: &HashMap<String, Value>,
) -> (HashMap<String, String>, HashMap<String, String>) {
    let mut query_params: HashMap<String, String> = HashMap::new();
    let mut headers: HashMap<String, String> = HashMap::new();

    for param in parameters {
        let name = param["name"].as_str().unwrap_or_default().to_string();
        if name.is_empty() {
            continue;
        }

        // Resolve $ref if needed
        let resolved = resolve_ref(param, schemas);
        let location = resolved["in"].as_str().unwrap_or("query");
        let example_value = extract_example_value(&resolved, schemas);

        match location {
            "query" => {
                query_params.insert(name, example_value);
            }
            "header" => {
                // Skip Authorization-type headers since auth engine handles those
                if !name.eq_ignore_ascii_case("authorization") {
                    headers.insert(name, example_value);
                }
            }
            _ => {} // "path" params are embedded in URL template; "cookie" ignored
        }
    }

    (query_params, headers)
}

/// Build a JSON body string from the request body schema, auto-filling examples
fn extract_body(request_body: &Option<Value>, schemas: &HashMap<String, Value>) -> Option<String> {
    let body = request_body.as_ref()?;

    // Try application/json first, then any content type
    let content = &body["content"];
    let schema_container = content
        .get("application/json")
        .or_else(|| content.as_object().and_then(|o| o.values().next()));

    let Some(container) = schema_container else {
        return None;
    };

    let schema = &container["schema"];
    if schema.is_null() {
        return None;
    }

    let resolved = resolve_ref(schema, schemas);
    let example = build_example_from_schema(&resolved, schemas, 0);
    Some(serde_json::to_string_pretty(&example).unwrap_or_default())
}

/// Resolve a JSON $ref pointer within the same document's schemas map
fn resolve_ref<'a>(value: &'a Value, schemas: &'a HashMap<String, Value>) -> std::borrow::Cow<'a, Value> {
    if let Some(ref_str) = value["$ref"].as_str() {
        // Format: "#/components/schemas/Foo" or "#/definitions/Foo"
        let parts: Vec<&str> = ref_str.trim_start_matches('#').trim_start_matches('/').split('/').collect();
        if let Some(schema_name) = parts.last() {
            if let Some(resolved) = schemas.get(*schema_name) {
                return std::borrow::Cow::Borrowed(resolved);
            }
        }
    }
    std::borrow::Cow::Borrowed(value)
}

/// Extract a representative example value from a parameter or schema node
fn extract_example_value(node: &Value, schemas: &HashMap<String, Value>) -> String {
    // Priority: example > schema.example > schema.default > type-based placeholder
    if let Some(ex) = node.get("example").filter(|v| !v.is_null()) {
        return value_to_string(ex);
    }
    if let Some(ex) = node["schema"].get("example").filter(|v| !v.is_null()) {
        return value_to_string(ex);
    }
    if let Some(def) = node["schema"].get("default").filter(|v| !v.is_null()) {
        return value_to_string(def);
    }

    // Fall back to type-based placeholder
    let schema = &node["schema"];
    let resolved = resolve_ref(schema, schemas);
    type_placeholder(resolved.get("type").and_then(|t| t.as_str()))
}

/// Build a representative JSON Value from a schema for use as a request body example
fn build_example_from_schema(schema: &Value, schemas: &HashMap<String, Value>, depth: u8) -> Value {
    if depth > 4 {
        return Value::Null; // prevent infinite recursion on circular refs
    }

    // Honor explicit example/default at schema level
    if let Some(ex) = schema.get("example").filter(|v| !v.is_null()) {
        return ex.clone();
    }
    if let Some(def) = schema.get("default").filter(|v| !v.is_null()) {
        return def.clone();
    }

    let schema_type = schema["type"].as_str().unwrap_or("");

    match schema_type {
        "object" | "" => {
            // Could be an object or a $ref already resolved
            let mut obj = serde_json::Map::new();
            if let Some(props) = schema["properties"].as_object() {
                for (key, prop_schema) in props {
                    let resolved = resolve_ref(prop_schema, schemas);
                    obj.insert(key.clone(), build_example_from_schema(&resolved, schemas, depth + 1));
                }
            }
            Value::Object(obj)
        }
        "array" => {
            let items_schema = &schema["items"];
            if items_schema.is_null() {
                Value::Array(vec![])
            } else {
                let resolved = resolve_ref(items_schema, schemas);
                Value::Array(vec![build_example_from_schema(&resolved, schemas, depth + 1)])
            }
        }
        "string" => {
            // Use enum first value if available
            if let Some(arr) = schema["enum"].as_array() {
                arr.first().cloned().unwrap_or(Value::String("string".into()))
            } else if let Some(fmt) = schema["format"].as_str() {
                Value::String(format_placeholder(fmt))
            } else {
                Value::String("string".into())
            }
        }
        "integer" | "number" => Value::Number(0.into()),
        "boolean" => Value::Bool(false),
        "null" => Value::Null,
        _ => Value::Null,
    }
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => v.to_string(),
    }
}

fn type_placeholder(t: Option<&str>) -> String {
    match t {
        Some("integer") | Some("number") => "0".to_string(),
        Some("boolean") => "false".to_string(),
        _ => "string".to_string(),
    }
}

fn format_placeholder(fmt: &str) -> String {
    match fmt {
        "date-time" => "2024-01-01T00:00:00Z".to_string(),
        "date" => "2024-01-01".to_string(),
        "email" => "user@example.com".to_string(),
        "uri" | "url" => "https://example.com".to_string(),
        "uuid" => "00000000-0000-0000-0000-000000000000".to_string(),
        _ => "string".to_string(),
    }
}

fn epoch_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

// ─── gRPC / Proto collection generation ─────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GenerateProtoCollectionRequest {
    pub parsed_proto: crate::commands::proto::ParsedProto,
    pub workspace_id: Option<String>,
    pub parent_collection_id: Option<String>,
    pub collection_id: Option<String>,
    pub collection_name: Option<String>,
}

#[tauri::command]
pub async fn generate_collection_from_proto(
    state: State<'_, DbState>,
    request: GenerateProtoCollectionRequest,
) -> Result<SyncResult, AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let now = epoch_now();
    let proto = &request.parsed_proto;

    let collection_name = request
        .collection_name
        .clone()
        .unwrap_or_else(|| {
            if proto.package.is_empty() {
                "gRPC Services".to_string()
            } else {
                proto.package.clone()
            }
        });

    log::info!(
        "[generate_collection_from_proto] package='{}', services={}, descriptor_bytes={}",
        proto.package,
        proto.services.len(),
        proto.descriptor_bytes.len()
    );
    for svc in &proto.services {
        log::info!("[generate_collection_from_proto] service='{}', methods={}", svc.full_name, svc.methods.len());
        for m in &svc.methods {
            log::info!("[generate_collection_from_proto]   method='{}', streaming=({},{})", m.full_name, m.client_streaming, m.server_streaming);
        }
    }

    // ── 1. Ensure root collection ───────────────────────────────────────────
    let root_id = if let Some(existing_id) = &request.collection_id {
        existing_id.clone()
    } else if let Some(parent_id) = &request.parent_collection_id {
        // Create subfolder under parent
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO collections (id, workspace_id, name, parent_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                id,
                request.workspace_id,
                collection_name,
                parent_id,
                now,
                now
            ],
        )?;
        id
    } else {
        // Create new root collection
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO collections (id, workspace_id, name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, request.workspace_id, collection_name, now, now],
        )?;
        id
    };

    // ── 2. Load existing gRPC meta for this collection ──────────────────────
    let mut existing_meta: HashMap<String, (String, String, bool)> = HashMap::new(); // operation_id -> (request_id, fingerprint, user_edited)
    {
        let mut stmt = conn.prepare(
            "SELECT gm.operation_id, gm.request_id, gm.spec_fingerprint, gm.user_edited
             FROM request_grpc_meta gm
             JOIN requests r ON r.id = gm.request_id
             WHERE r.collection_id = ?1",
        )?;
        let rows = stmt.query_map(rusqlite::params![root_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i32>(3)? != 0,
            ))
        })?;
        for row in rows {
            let (op_id, req_id, fp, user_edited) = row?;
            existing_meta.insert(op_id, (req_id, fp, user_edited));
        }
    }

    let mut created = 0u32;
    let mut updated = 0u32;
    let mut skipped = 0u32;
    let mut seen_operations = Vec::new();
    let mut sort_order = 0i64;

    // ── 3. Process each service/method ──────────────────────────────────────
    for service in &proto.services {
        for method in &service.methods {
            // Skip streaming methods for MVP
            if method.client_streaming || method.server_streaming {
                continue;
            }

            let operation_id = method.full_name.clone(); // "package.Service/Method"
            seen_operations.push(operation_id.clone());

            // Compute fingerprint from method signature
            let fingerprint = {
                use std::collections::hash_map::DefaultHasher;
                use std::hash::{Hash, Hasher};
                let mut hasher = DefaultHasher::new();
                method.full_name.hash(&mut hasher);
                method.input_type.hash(&mut hasher);
                method.output_type.hash(&mut hasher);
                method.input_schema_json.hash(&mut hasher);
                format!("{:x}", hasher.finish())
            };

            let request_name = format!("{}/{}", service.name, method.name);

            if let Some((req_id, existing_fp, user_edited)) = existing_meta.get(&operation_id) {
                if *user_edited {
                    skipped += 1;
                    continue;
                }
                if existing_fp == &fingerprint {
                    skipped += 1;
                    continue;
                }
                // Update existing request
                conn.execute(
                    "UPDATE requests SET name=?1, body=?2, updated_at=?3, sort_order=?4 WHERE id=?5",
                    rusqlite::params![
                        request_name,
                        method.input_schema_json,
                        now,
                        sort_order,
                        req_id
                    ],
                )?;
                conn.execute(
                    "UPDATE request_grpc_meta SET spec_fingerprint=?1, proto_descriptor=?2, input_type_name=?3, output_type_name=?4 WHERE request_id=?5",
                    rusqlite::params![
                        fingerprint,
                        proto.descriptor_bytes,
                        method.input_type,
                        method.output_type,
                        req_id
                    ],
                )?;
                updated += 1;
            } else {
                // Create new request
                let req_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO requests (id, collection_id, name, method, url, headers, query_params, body, sort_order, created_at, updated_at, request_type)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    rusqlite::params![
                        req_id,
                        root_id,
                        request_name,
                        "GRPC",
                        "{{GRPC_HOST}}",
                        "{}",
                        "{}",
                        method.input_schema_json,
                        sort_order,
                        now,
                        now,
                        "grpc"
                    ],
                )?;
                conn.execute(
                    "INSERT INTO request_grpc_meta (request_id, service_name, method_name, proto_descriptor, input_type_name, output_type_name, operation_id, spec_fingerprint)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    rusqlite::params![
                        req_id,
                        service.full_name,
                        method.name,
                        proto.descriptor_bytes,
                        method.input_type,
                        method.output_type,
                        operation_id,
                        fingerprint
                    ],
                )?;
                created += 1;
            }
            sort_order += 1;
        }
    }

    // ── 4. Remove operations no longer in proto (unless user-edited) ────────
    let mut removed = 0u32;
    for (op_id, (req_id, _, user_edited)) in &existing_meta {
        if !seen_operations.contains(op_id) && !user_edited {
            conn.execute("DELETE FROM requests WHERE id = ?1", rusqlite::params![req_id])?;
            removed += 1;
        }
    }

    Ok(SyncResult {
        root_collection_id: root_id,
        tag_collections: vec![],
        requests_created: created,
        requests_updated: updated,
        requests_skipped: skipped,
        requests_removed: removed,
    })
}
