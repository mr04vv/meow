use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

use crate::auth::AuthConfig;
use crate::error::AppError;
use crate::storage::DbState;

// ─── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedRequest {
    pub id: String,
    pub collection_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub query_params: HashMap<String, String>,
    pub body: Option<String>,
    pub auth_type: Option<String>,
    pub auth_config: Option<Value>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub request_type: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRequestRequest {
    pub collection_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers: Option<HashMap<String, String>>,
    pub query_params: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub auth_type: Option<String>,
    pub auth_config: Option<Value>,
    pub sort_order: Option<i64>,
    pub request_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRequestRequest {
    pub id: String,
    pub collection_id: Option<String>,
    pub name: Option<String>,
    pub method: Option<String>,
    pub url: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub query_params: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub auth_type: Option<String>,
    pub auth_config: Option<Value>,
    pub sort_order: Option<i64>,
    pub request_type: Option<String>,
}

// ─── gRPC metadata DTO ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct GrpcMeta {
    pub request_id: String,
    pub service_name: String,
    pub method_name: String,
    pub proto_descriptor: Vec<u8>,
    pub input_type_name: String,
    pub output_type_name: String,
    pub operation_id: String,
    pub spec_fingerprint: String,
    pub user_edited: bool,
}

// ─── Request CRUD ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_request(
    state: State<'_, DbState>,
    request: CreateRequestRequest,
) -> Result<SavedRequest, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let id = Uuid::new_v4().to_string();
    let now = epoch_now();

    let headers = request.headers.unwrap_or_default();
    let query_params = request.query_params.unwrap_or_default();
    let headers_json = serde_json::to_string(&headers)?;
    let query_params_json = serde_json::to_string(&query_params)?;
    let auth_config_json = request.auth_config
        .as_ref()
        .map(|v| serde_json::to_string(v))
        .transpose()?;
    let sort_order = request.sort_order.unwrap_or(0);

    let request_type = request.request_type.unwrap_or_else(|| "rest".to_string());

    conn.execute(
        "INSERT INTO requests (id, collection_id, name, method, url, headers, query_params, body, auth_type, auth_config, sort_order, created_at, updated_at, request_type)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            id, request.collection_id, request.name, request.method, request.url,
            headers_json, query_params_json, request.body, request.auth_type, auth_config_json,
            sort_order, now, now, request_type
        ],
    )?;

    Ok(SavedRequest {
        id,
        collection_id: request.collection_id,
        name: request.name,
        method: request.method,
        url: request.url,
        headers,
        query_params,
        body: request.body,
        auth_type: request.auth_type,
        auth_config: request.auth_config,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
        request_type,
    })
}

#[tauri::command]
pub async fn list_requests(
    state: State<'_, DbState>,
    collection_id: Option<String>,
) -> Result<Vec<SavedRequest>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;

    let requests = if let Some(cid) = collection_id {
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, name, method, url, headers, query_params, body, auth_type, auth_config, sort_order, created_at, updated_at, request_type
             FROM requests WHERE collection_id = ?1 ORDER BY sort_order ASC, created_at ASC",
        )?;
        let x = stmt.query_map(rusqlite::params![cid], row_to_saved_request)?
            .collect::<Result<Vec<_>, _>>()?; x
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, name, method, url, headers, query_params, body, auth_type, auth_config, sort_order, created_at, updated_at, request_type
             FROM requests ORDER BY sort_order ASC, created_at ASC",
        )?;
        let x = stmt.query_map([], row_to_saved_request)?
            .collect::<Result<Vec<_>, _>>()?; x
    };

    Ok(requests)
}

#[tauri::command]
pub async fn get_request(
    state: State<'_, DbState>,
    id: String,
) -> Result<SavedRequest, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let req = conn.query_row(
        "SELECT id, collection_id, name, method, url, headers, query_params, body, auth_type, auth_config, sort_order, created_at, updated_at, request_type
         FROM requests WHERE id = ?1",
        rusqlite::params![id],
        row_to_saved_request,
    )?;
    Ok(req)
}

#[tauri::command]
pub async fn update_request(
    state: State<'_, DbState>,
    request: UpdateRequestRequest,
) -> Result<SavedRequest, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    let now = epoch_now();

    // Load current state
    let current = conn.query_row(
        "SELECT id, collection_id, name, method, url, headers, query_params, body, auth_type, auth_config, sort_order, created_at, updated_at, request_type
         FROM requests WHERE id = ?1",
        rusqlite::params![request.id],
        row_to_saved_request,
    )?;

    let name = request.name.unwrap_or(current.name);
    let method = request.method.unwrap_or(current.method);
    let url = request.url.unwrap_or(current.url);
    let headers = request.headers.unwrap_or(current.headers);
    let query_params = request.query_params.unwrap_or(current.query_params);
    let body = if request.body.is_some() { request.body } else { current.body };
    let auth_type = if request.auth_type.is_some() { request.auth_type } else { current.auth_type };
    let auth_config = if request.auth_config.is_some() { request.auth_config } else { current.auth_config };
    let collection_id = if request.collection_id.is_some() { request.collection_id } else { current.collection_id };
    let sort_order = request.sort_order.unwrap_or(current.sort_order);
    let request_type = request.request_type.unwrap_or(current.request_type);

    let headers_json = serde_json::to_string(&headers)?;
    let query_params_json = serde_json::to_string(&query_params)?;
    let auth_config_json = auth_config.as_ref().map(|v| serde_json::to_string(v)).transpose()?;

    conn.execute(
        "UPDATE requests SET collection_id=?1, name=?2, method=?3, url=?4, headers=?5, query_params=?6, body=?7, auth_type=?8, auth_config=?9, sort_order=?10, updated_at=?11, request_type=?13
         WHERE id=?12",
        rusqlite::params![
            collection_id, name, method, url, headers_json, query_params_json, body,
            auth_type, auth_config_json, sort_order, now, request.id, request_type
        ],
    )?;

    Ok(SavedRequest {
        id: request.id,
        collection_id,
        name,
        method,
        url,
        headers,
        query_params,
        body,
        auth_type,
        auth_config,
        sort_order,
        created_at: current.created_at,
        updated_at: now,
        request_type,
    })
}

#[tauri::command]
pub async fn delete_request(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    conn.execute("DELETE FROM requests WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

/// Retrieve the stored OpenAPI docs JSON for a request, if any
#[tauri::command]
pub async fn get_request_docs(
    state: State<'_, DbState>,
    request_id: String,
) -> Result<Option<String>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    match conn.query_row(
        "SELECT openapi_docs FROM request_openapi_meta WHERE request_id = ?1",
        rusqlite::params![request_id],
        |row| row.get::<_, Option<String>>(0),
    ) {
        Ok(docs) => Ok(docs),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

// ─── gRPC metadata ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_request_grpc_meta(
    state: State<'_, DbState>,
    request_id: String,
) -> Result<Option<GrpcMeta>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
    match conn.query_row(
        "SELECT request_id, service_name, method_name, proto_descriptor, input_type_name, output_type_name, operation_id, spec_fingerprint, user_edited
         FROM request_grpc_meta WHERE request_id = ?1",
        rusqlite::params![request_id],
        |row| {
            Ok(GrpcMeta {
                request_id: row.get(0)?,
                service_name: row.get(1)?,
                method_name: row.get(2)?,
                proto_descriptor: row.get(3)?,
                input_type_name: row.get(4)?,
                output_type_name: row.get(5)?,
                operation_id: row.get(6)?,
                spec_fingerprint: row.get(7)?,
                user_edited: row.get::<_, i32>(8)? != 0,
            })
        },
    ) {
        Ok(meta) => Ok(Some(meta)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

/// Generate gRPC docs JSON from the stored proto descriptor for a given request
#[tauri::command]
pub async fn get_grpc_docs(
    state: State<'_, DbState>,
    request_id: String,
) -> Result<Option<String>, AppError> {
    let (descriptor, service_name, method_name, input_type, output_type) = {
        let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        match conn.query_row(
            "SELECT proto_descriptor, service_name, method_name, input_type_name, output_type_name
             FROM request_grpc_meta WHERE request_id = ?1",
            rusqlite::params![request_id],
            |row| Ok((
                row.get::<_, Vec<u8>>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            )),
        ) {
            Ok(data) => data,
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
            Err(e) => return Err(AppError::Database(e)),
        }
    };

    let pool = prost_reflect::DescriptorPool::decode(descriptor.as_slice())
        .map_err(|e| AppError::Custom(format!("Failed to decode descriptor: {}", e)))?;

    let input_schema = pool.get_message_by_name(&input_type)
        .map(|desc| describe_message(&desc, 0));
    let output_schema = pool.get_message_by_name(&output_type)
        .map(|desc| describe_message(&desc, 0));

    let docs = serde_json::json!({
        "type": "grpc",
        "service": service_name,
        "method": method_name,
        "input_type": input_type,
        "output_type": output_type,
        "input_schema": input_schema,
        "output_schema": output_schema,
    });

    Ok(Some(serde_json::to_string(&docs).unwrap_or_default()))
}

fn describe_message(desc: &prost_reflect::MessageDescriptor, depth: usize) -> serde_json::Value {
    if depth > 5 {
        return serde_json::json!({ "type": "message", "name": desc.full_name() });
    }
    let fields: Vec<serde_json::Value> = desc.fields().map(|f| {
        let mut field_info = serde_json::json!({
            "name": f.name(),
            "number": f.number(),
            "type": describe_kind(&f.kind(), depth),
            "repeated": f.is_list(),
            "map": f.is_map(),
        });
        if let Some(oneof) = f.containing_oneof() {
            field_info["oneof"] = serde_json::json!(oneof.name());
        }
        field_info
    }).collect();

    serde_json::json!({
        "name": desc.full_name(),
        "fields": fields,
    })
}

fn describe_kind(kind: &prost_reflect::Kind, depth: usize) -> serde_json::Value {
    match kind {
        prost_reflect::Kind::Double => serde_json::json!("double"),
        prost_reflect::Kind::Float => serde_json::json!("float"),
        prost_reflect::Kind::Int32 | prost_reflect::Kind::Sint32 | prost_reflect::Kind::Sfixed32 => serde_json::json!("int32"),
        prost_reflect::Kind::Int64 | prost_reflect::Kind::Sint64 | prost_reflect::Kind::Sfixed64 => serde_json::json!("int64"),
        prost_reflect::Kind::Uint32 | prost_reflect::Kind::Fixed32 => serde_json::json!("uint32"),
        prost_reflect::Kind::Uint64 | prost_reflect::Kind::Fixed64 => serde_json::json!("uint64"),
        prost_reflect::Kind::Bool => serde_json::json!("bool"),
        prost_reflect::Kind::String => serde_json::json!("string"),
        prost_reflect::Kind::Bytes => serde_json::json!("bytes"),
        prost_reflect::Kind::Enum(e) => {
            let values: Vec<serde_json::Value> = e.values().map(|v| {
                serde_json::json!({ "name": v.name(), "number": v.number() })
            }).collect();
            serde_json::json!({ "enum": e.full_name(), "values": values })
        }
        prost_reflect::Kind::Message(m) => {
            describe_message(m, depth + 1)
        }
    }
}

// ─── Auth application ────────────────────────────────────────────────────────

/// Resolve the auth config for a request and return headers/query params to inject.
/// Merges request-level auth with collection-level auth (request takes precedence).
#[tauri::command]
pub async fn resolve_auth(
    auth_config_json: Option<String>,
) -> Result<ResolvedAuth, AppError> {
    let Some(json) = auth_config_json else {
        return Ok(ResolvedAuth::default());
    };

    let config: AuthConfig = serde_json::from_str(&json)?;
    let applied = config.apply();

    Ok(ResolvedAuth {
        headers: applied.headers,
        query_params: applied.query_params,
    })
}

#[derive(Debug, Serialize, Default)]
pub struct ResolvedAuth {
    pub headers: HashMap<String, String>,
    pub query_params: HashMap<String, String>,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn row_to_saved_request(row: &rusqlite::Row<'_>) -> rusqlite::Result<SavedRequest> {
    let headers_str: String = row.get(5)?;
    let query_params_str: String = row.get(6)?;
    let auth_config_str: Option<String> = row.get(9)?;

    let headers: HashMap<String, String> = serde_json::from_str(&headers_str).unwrap_or_default();
    let query_params: HashMap<String, String> = serde_json::from_str(&query_params_str).unwrap_or_default();
    let auth_config: Option<Value> = auth_config_str
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok());

    Ok(SavedRequest {
        id: row.get(0)?,
        collection_id: row.get(1)?,
        name: row.get(2)?,
        method: row.get(3)?,
        url: row.get(4)?,
        headers,
        query_params,
        body: row.get(7)?,
        auth_type: row.get(8)?,
        auth_config,
        sort_order: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        request_type: row.get::<_, Option<String>>(13)?.unwrap_or_else(|| "rest".to_string()),
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
