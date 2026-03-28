use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

use crate::error::AppError;

// ─── DTOs ─────────────────────────────────────────────────────────────────────

/// Parsed representation of an OpenAPI/Swagger document
#[derive(Debug, Serialize)]
pub struct ParsedOpenApi {
    pub version: String,          // "3.0", "3.1", or "2.0"
    pub title: String,
    pub description: Option<String>,
    pub servers: Vec<ServerInfo>,
    pub paths: Vec<PathInfo>,
    pub schemas: HashMap<String, Value>,
    pub security_schemes: HashMap<String, Value>,
}

#[derive(Debug, Serialize)]
pub struct ServerInfo {
    pub url: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PathInfo {
    pub path: String,
    pub operations: Vec<OperationInfo>,
}

#[derive(Debug, Serialize)]
pub struct OperationInfo {
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

/// Candidate OpenAPI files found in a repository file tree
#[derive(Debug, Serialize)]
pub struct OpenApiCandidate {
    pub path: String,
    pub likely_version: Option<String>,
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Detect OpenAPI/Swagger file candidates from a list of file paths
#[tauri::command]
pub fn detect_openapi_files(paths: Vec<String>) -> Vec<OpenApiCandidate> {
    let candidates: Vec<OpenApiCandidate> = paths
        .into_iter()
        .filter(|p| is_openapi_candidate(p))
        .map(|p| OpenApiCandidate {
            path: p,
            likely_version: None,
        })
        .collect();
    candidates
}

/// Parse an OpenAPI/Swagger document from a YAML or JSON string
#[tauri::command]
pub fn parse_openapi(content: String, filename: Option<String>) -> Result<ParsedOpenApi, AppError> {
    let doc: Value = if is_yaml_filename(filename.as_deref()) || looks_like_yaml(&content) {
        serde_yaml::from_str(&content)
            .map_err(|e| AppError::Custom(format!("YAML parse error: {}", e)))?
    } else {
        serde_json::from_str(&content)
            .map_err(|e| AppError::Custom(format!("JSON parse error: {}", e)))?
    };

    parse_openapi_value(doc)
}

// ─── Detection helpers ────────────────────────────────────────────────────────

const OPENAPI_FILENAMES: &[&str] = &[
    "openapi.yaml", "openapi.yml", "openapi.json",
    "swagger.yaml", "swagger.yml", "swagger.json",
    "api.yaml", "api.yml", "api.json",
    "api-spec.yaml", "api-spec.yml", "api-spec.json",
];

fn is_openapi_candidate(path: &str) -> bool {
    let lower = path.to_lowercase();
    let filename = lower.rsplit('/').next().unwrap_or(&lower);

    // Exact known filenames
    if OPENAPI_FILENAMES.contains(&filename) {
        return true;
    }

    // Heuristic: files containing "openapi" or "swagger" in name with yaml/json extension
    if (lower.contains("openapi") || lower.contains("swagger"))
        && (lower.ends_with(".yaml") || lower.ends_with(".yml") || lower.ends_with(".json"))
    {
        return true;
    }

    false
}

fn is_yaml_filename(filename: Option<&str>) -> bool {
    filename.map_or(false, |f| {
        let lower = f.to_lowercase();
        lower.ends_with(".yaml") || lower.ends_with(".yml")
    })
}

fn looks_like_yaml(content: &str) -> bool {
    let trimmed = content.trim_start();
    // JSON always starts with { or [; anything else is likely YAML
    !trimmed.starts_with('{') && !trimmed.starts_with('[')
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

fn parse_openapi_value(doc: Value) -> Result<ParsedOpenApi, AppError> {
    let version = detect_spec_version(&doc)?;
    let title = doc["info"]["title"]
        .as_str()
        .unwrap_or("Untitled")
        .to_string();
    let description = doc["info"]["description"].as_str().map(|s| s.to_string());

    let servers = if version.starts_with("2.") {
        parse_swagger2_servers(&doc)
    } else {
        parse_openapi3_servers(&doc)
    };

    let paths = parse_paths(&doc, &version);
    let schemas = parse_schemas(&doc, &version);
    let security_schemes = parse_security_schemes(&doc, &version);

    Ok(ParsedOpenApi {
        version,
        title,
        description,
        servers,
        paths,
        schemas,
        security_schemes,
    })
}

fn detect_spec_version(doc: &Value) -> Result<String, AppError> {
    if let Some(v) = doc["openapi"].as_str() {
        // OpenAPI 3.x
        if v.starts_with("3.1") {
            return Ok("3.1".to_string());
        }
        if v.starts_with("3.") {
            return Ok("3.0".to_string());
        }
        return Ok(v.to_string());
    }
    if let Some(v) = doc["swagger"].as_str() {
        // Swagger 2.0
        return Ok(v.to_string());
    }
    Err(AppError::Custom(
        "Not a valid OpenAPI/Swagger document (missing 'openapi' or 'swagger' field)".into(),
    ))
}

fn parse_openapi3_servers(doc: &Value) -> Vec<ServerInfo> {
    doc["servers"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|s| {
                    let url = s["url"].as_str()?.to_string();
                    Some(ServerInfo {
                        url,
                        description: s["description"].as_str().map(|d| d.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_swagger2_servers(doc: &Value) -> Vec<ServerInfo> {
    let host = doc["host"].as_str().unwrap_or("localhost");
    let base_path = doc["basePath"].as_str().unwrap_or("/");
    let schemes = doc["schemes"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|s| s.as_str())
        .unwrap_or("https");
    vec![ServerInfo {
        url: format!("{}://{}{}", schemes, host, base_path),
        description: None,
    }]
}

fn parse_paths(doc: &Value, _version: &str) -> Vec<PathInfo> {
    let Some(paths_obj) = doc["paths"].as_object() else {
        return vec![];
    };

    const HTTP_METHODS: &[&str] = &["get", "post", "put", "patch", "delete", "head", "options", "trace"];

    paths_obj
        .iter()
        .map(|(path, path_item)| {
            let operations = HTTP_METHODS
                .iter()
                .filter_map(|method| {
                    let op = &path_item[method];
                    if op.is_null() {
                        return None;
                    }
                    Some(OperationInfo {
                        method: method.to_uppercase(),
                        operation_id: op["operationId"].as_str().map(|s| s.to_string()),
                        summary: op["summary"].as_str().map(|s| s.to_string()),
                        description: op["description"].as_str().map(|s| s.to_string()),
                        tags: op["tags"]
                            .as_array()
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|t| t.as_str().map(|s| s.to_string()))
                                    .collect()
                            })
                            .unwrap_or_default(),
                        parameters: op["parameters"]
                            .as_array()
                            .cloned()
                            .unwrap_or_default(),
                        request_body: if op["requestBody"].is_null() {
                            None
                        } else {
                            Some(op["requestBody"].clone())
                        },
                        responses: op["responses"]
                            .as_object()
                            .map(|o| {
                                o.iter()
                                    .map(|(k, v)| (k.clone(), v.clone()))
                                    .collect()
                            })
                            .unwrap_or_default(),
                        security: op["security"]
                            .as_array()
                            .cloned()
                            .unwrap_or_default(),
                    })
                })
                .collect();

            PathInfo {
                path: path.clone(),
                operations,
            }
        })
        .collect()
}

fn parse_schemas(doc: &Value, version: &str) -> HashMap<String, Value> {
    let schemas_value = if version.starts_with("2.") {
        &doc["definitions"]
    } else {
        &doc["components"]["schemas"]
    };

    schemas_value
        .as_object()
        .map(|o| o.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default()
}

fn parse_security_schemes(doc: &Value, version: &str) -> HashMap<String, Value> {
    let schemes_value = if version.starts_with("2.") {
        &doc["securityDefinitions"]
    } else {
        &doc["components"]["securitySchemes"]
    };

    schemes_value
        .as_object()
        .map(|o| o.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default()
}
