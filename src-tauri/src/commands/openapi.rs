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

    // Build a combined components map for $ref resolution
    // Includes schemas, responses, parameters, requestBodies (OAS3) and definitions (Swagger 2)
    let components: serde_json::Map<String, Value> = {
        let mut map = serde_json::Map::new();
        // OAS3: flatten components/* into a single map
        if let Some(components_obj) = doc["components"].as_object() {
            for (_section_name, section_value) in components_obj {
                if let Some(section_map) = section_value.as_object() {
                    for (k, v) in section_map {
                        map.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        // Swagger 2: definitions
        if let Some(defs) = doc["definitions"].as_object() {
            for (k, v) in defs {
                map.insert(k.clone(), v.clone());
            }
        }
        map
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

                    // Resolve $ref in parameters
                    let parameters = op["parameters"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .map(|p| resolve_refs(p, &components))
                                .collect()
                        })
                        .unwrap_or_default();

                    // Resolve $ref in requestBody
                    let request_body = if op["requestBody"].is_null() {
                        None
                    } else {
                        Some(resolve_refs(&op["requestBody"], &components))
                    };

                    // Resolve $ref in responses
                    let responses = op["responses"]
                        .as_object()
                        .map(|o| {
                            o.iter()
                                .map(|(k, v)| (k.clone(), resolve_refs(v, &components)))
                                .collect()
                        })
                        .unwrap_or_default();

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
                        parameters,
                        request_body,
                        responses,
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

/// Recursively walk a JSON value and replace any `{"$ref": "#/components/schemas/Foo"}`
/// (or `#/definitions/Foo`) with the actual schema from the components map.
/// Also handles `allOf` by merging all sub-schemas' properties into a single object schema.
fn resolve_refs(value: &Value, components: &serde_json::Map<String, Value>) -> Value {
    resolve_refs_inner(value, components, 0)
}

fn resolve_refs_inner(value: &Value, components: &serde_json::Map<String, Value>, depth: u8) -> Value {
    if depth > 8 {
        // Guard against circular references
        return value.clone();
    }

    match value {
        Value::Object(map) => {
            // If this node is a $ref, resolve it
            if let Some(ref_str) = map.get("$ref").and_then(|v| v.as_str()) {
                let schema_name = ref_str
                    .trim_start_matches('#')
                    .trim_start_matches('/')
                    .split('/')
                    .last()
                    .unwrap_or("");
                if let Some(resolved) = components.get(schema_name) {
                    return resolve_refs_inner(resolved, components, depth + 1);
                }
                // Unknown $ref — return as-is
                return value.clone();
            }

            // Handle allOf: merge all sub-schemas' properties into one object schema
            if let Some(all_of) = map.get("allOf").and_then(|v| v.as_array()) {
                let mut merged_props = serde_json::Map::new();
                let mut required: Vec<Value> = Vec::new();
                for sub in all_of {
                    let resolved_sub = resolve_refs_inner(sub, components, depth + 1);
                    if let Some(props) = resolved_sub["properties"].as_object() {
                        for (k, v) in props {
                            merged_props.insert(k.clone(), v.clone());
                        }
                    }
                    if let Some(req) = resolved_sub["required"].as_array() {
                        required.extend_from_slice(req);
                    }
                }
                let mut result = serde_json::Map::new();
                result.insert("type".to_string(), Value::String("object".to_string()));
                result.insert("properties".to_string(), Value::Object(merged_props));
                if !required.is_empty() {
                    result.insert("required".to_string(), Value::Array(required));
                }
                return Value::Object(result);
            }

            // Handle oneOf / anyOf: resolve $ref in each option, keep as array of alternatives
            for key in &["oneOf", "anyOf"] {
                if let Some(variants) = map.get(*key).and_then(|v| v.as_array()) {
                    let resolved_variants: Vec<Value> = variants
                        .iter()
                        .map(|v| resolve_refs_inner(v, components, depth + 1))
                        .collect();
                    let mut result = serde_json::Map::new();
                    result.insert(key.to_string(), Value::Array(resolved_variants));
                    return Value::Object(result);
                }
            }

            // Recursively resolve all fields
            let resolved_map: serde_json::Map<String, Value> = map
                .iter()
                .map(|(k, v)| (k.clone(), resolve_refs_inner(v, components, depth + 1)))
                .collect();
            Value::Object(resolved_map)
        }
        Value::Array(arr) => {
            Value::Array(arr.iter().map(|v| resolve_refs_inner(v, components, depth + 1)).collect())
        }
        // Primitives pass through unchanged
        other => other.clone(),
    }
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
