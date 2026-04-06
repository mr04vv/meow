use prost::Message;
use prost_reflect::{DescriptorPool, FieldDescriptor, Kind, MessageDescriptor};
use serde::{Deserialize, Serialize};
use std::io::Write;

use crate::error::AppError;

// ─── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ProtoFileContent {
    pub filename: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParsedProto {
    pub package: String,
    pub services: Vec<ProtoService>,
    pub descriptor_bytes: Vec<u8>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProtoService {
    pub name: String,
    pub full_name: String,
    pub methods: Vec<ProtoMethod>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProtoMethod {
    pub name: String,
    pub full_name: String,
    pub input_type: String,
    pub output_type: String,
    pub client_streaming: bool,
    pub server_streaming: bool,
    pub input_schema_json: String,
}

// ─── Proto parsing ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn parse_proto(
    files: Vec<ProtoFileContent>,
) -> Result<ParsedProto, AppError> {
    if files.is_empty() {
        return Err(AppError::Custom("No proto files provided".into()));
    }

    // Write proto files to a temp directory so protox can resolve imports
    let tmp_dir = tempfile::tempdir()
        .map_err(|e| AppError::Custom(format!("Failed to create temp dir: {}", e)))?;

    // Collect all provided file paths
    let provided_paths: std::collections::HashSet<String> =
        files.iter().map(|f| f.filename.clone()).collect();

    // Identify external imports (not in provided files and not google well-known)
    // Use suffix matching because provided paths may have a prefix (e.g., "proto/pkg/foo.proto")
    // while import paths use the protobuf package path (e.g., "pkg/foo.proto")
    let import_re = regex::Regex::new(r#"import\s+"([^"]+)"\s*;"#).unwrap();
    let mut external_imports: std::collections::HashSet<String> = std::collections::HashSet::new();
    for file in &files {
        for cap in import_re.captures_iter(&file.content) {
            let import_path = cap[1].to_string();
            let is_provided = provided_paths.iter().any(|p| {
                p == &import_path || p.ends_with(&format!("/{}", import_path))
            });
            if !is_provided && !import_path.starts_with("google/protobuf/") {
                external_imports.insert(import_path);
            }
        }
    }

    if !external_imports.is_empty() {
        log::info!("[parse_proto] Stripping external imports: {:?}", external_imports);
    }

    // Write files to temp dir, stripping external imports and field option annotations
    // that reference them (e.g., [(buf.validate.field).string.min_len = 1])
    // Match field options like: `[(buf.validate.field).string.min_len = 1]`
    // These appear between the field number and semicolon: `string name = 1 [(...)];`
    let option_re = regex::Regex::new(r"\s*\[(\([^)]*\)[^\]]*)\]\s*;").unwrap();
    for file in &files {
        let file_path = tmp_dir.path().join(&file.filename);
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::Custom(format!("Failed to create dir: {}", e)))?;
        }

        // Strip external import lines and option annotations referencing external packages
        let mut cleaned_lines = Vec::new();
        // Derive package prefixes from external imports for option stripping
        // e.g., "buf/validate/validate.proto" -> "buf.validate"
        let external_prefixes: Vec<String> = external_imports
            .iter()
            .map(|p| {
                p.trim_end_matches(".proto")
                    .replace('/', ".")
                    .rsplit_once('.')
                    .map(|(pkg, _)| pkg.to_string())
                    .unwrap_or_default()
            })
            .filter(|p| !p.is_empty())
            .collect();

        let mut in_multiline_option = false;
        for line in file.content.lines() {
            let trimmed = line.trim();

            // Track multi-line option blocks: `option (ext.foo) = { ... };`
            if in_multiline_option {
                // End of multi-line option block
                if trimmed.ends_with("};") || trimmed == "};" {
                    in_multiline_option = false;
                }
                continue;
            }

            // Skip import lines for external deps
            if trimmed.starts_with("import ") {
                if let Some(cap) = import_re.captures(trimmed) {
                    if external_imports.contains(&cap[1]) {
                        continue;
                    }
                }
            }

            let has_external_ref = external_prefixes.iter().any(|prefix| trimmed.contains(prefix.as_str()));

            if has_external_ref {
                // Skip standalone option lines: `option (buf.validate.message).cel = { ... };`
                if trimmed.starts_with("option ") {
                    // Check if this is a multi-line option (ends with `{` not `};`)
                    if trimmed.ends_with('{') {
                        in_multiline_option = true;
                    }
                    continue;
                }

                // For field definitions with inline options: `string name = 1 [(buf.validate...)];`
                // Remove the [...] part but keep the field definition
                let cleaned = option_re.replace_all(line, ";").to_string();
                cleaned_lines.push(cleaned);
            } else {
                cleaned_lines.push(line.to_string());
            }
        }

        let cleaned_content = cleaned_lines.join("\n");
        log::info!("[parse_proto] Cleaned file '{}' ({} -> {} bytes)", file.filename, file.content.len(), cleaned_content.len());
        // Log lines that were changed
        for (i, (orig, cleaned)) in file.content.lines().zip(cleaned_content.lines()).enumerate() {
            if orig != cleaned {
                log::info!("[parse_proto]   line {}: '{}' -> '{}'", i + 1, orig.trim(), cleaned.trim());
            }
        }
        let mut f = std::fs::File::create(&file_path)
            .map_err(|e| AppError::Custom(format!("Failed to write {}: {}", file.filename, e)))?;
        f.write_all(cleaned_content.as_bytes())
            .map_err(|e| AppError::Custom(format!("Failed to write {}: {}", file.filename, e)))?;
    }

    // Determine the proto root by inspecting import paths.
    // If file "proto/wevox_cerberus/v1/data.proto" contains `import "wevox_cerberus/v1/common.proto"`,
    // and we have file "proto/wevox_cerberus/v1/common.proto", then the import path
    // "wevox_cerberus/v1/common.proto" must be relative to "proto/" — so "proto/" is the proto root.
    let proto_root = {
        let mut detected_root: Option<String> = None;
        'outer: for file in &files {
            for cap in import_re.captures_iter(&file.content) {
                let import_path = &cap[1];
                if import_path.starts_with("google/") {
                    continue;
                }
                // Find a provided file whose path ends with this import path
                for provided in &files {
                    if provided.filename.ends_with(import_path) && provided.filename != import_path {
                        // The prefix is the proto root
                        let prefix = &provided.filename[..provided.filename.len() - import_path.len()];
                        detected_root = Some(prefix.to_string());
                        break 'outer;
                    }
                }
            }
        }
        detected_root.unwrap_or_default()
    };
    log::info!("[parse_proto] Detected proto root: '{}'", proto_root);

    let include_dir = if proto_root.is_empty() {
        tmp_dir.path().to_path_buf()
    } else {
        tmp_dir.path().join(&proto_root)
    };

    // Compile with protox
    let mut compiler = protox::Compiler::new(vec![include_dir.as_path()])
        .map_err(|e| AppError::Custom(format!("Failed to create proto compiler: {}", e)))?;

    compiler.include_imports(true);

    // Open files using paths relative to the proto root
    let relative_names: Vec<String> = files
        .iter()
        .map(|f| {
            f.filename
                .strip_prefix(&proto_root)
                .unwrap_or(&f.filename)
                .to_string()
        })
        .collect();
    log::info!("[parse_proto] Opening files: {:?}", relative_names);
    compiler
        .open_files(relative_names.iter().map(|s| s.as_str()))
        .map_err(|e| AppError::Custom(format!("Failed to compile proto files: {}", e)))?;

    let file_descriptor_set = compiler.file_descriptor_set();
    let descriptor_bytes = file_descriptor_set.encode_to_vec();

    // Build a descriptor pool for introspection
    let pool = DescriptorPool::decode(descriptor_bytes.as_slice())
        .map_err(|e| AppError::Custom(format!("Failed to build descriptor pool: {}", e)))?;

    // Extract services from all user-provided files (skip well-known types)
    let user_filenames: Vec<&str> = files.iter().map(|f| f.filename.as_str()).collect();
    let mut services = Vec::new();
    let mut package = String::new();

    for file_desc in pool.files() {
        log::info!("[parse_proto] file in pool: '{}', services: {}", file_desc.name(), file_desc.services().len());
        // Skip well-known google/protobuf imports
        if file_desc.name().starts_with("google/") {
            continue;
        }
        if package.is_empty() {
            package = file_desc.package_name().to_string();
        }

        for service_desc in file_desc.services() {
            let mut methods = Vec::new();
            for method_desc in service_desc.methods() {
                let input_desc = method_desc.input();
                let input_schema_json = build_example_json(&input_desc);

                methods.push(ProtoMethod {
                    name: method_desc.name().to_string(),
                    full_name: format!("{}/{}", service_desc.full_name(), method_desc.name()),
                    input_type: input_desc.full_name().to_string(),
                    output_type: method_desc.output().full_name().to_string(),
                    client_streaming: method_desc.is_client_streaming(),
                    server_streaming: method_desc.is_server_streaming(),
                    input_schema_json,
                });
            }

            services.push(ProtoService {
                name: service_desc.name().to_string(),
                full_name: service_desc.full_name().to_string(),
                methods,
            });
        }
    }

    Ok(ParsedProto {
        package,
        services,
        descriptor_bytes,
    })
}

// ─── JSON example generation from protobuf message descriptor ───────────────

fn build_example_json(desc: &MessageDescriptor) -> String {
    let value = build_example_value(desc, 0);
    serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".to_string())
}

fn build_example_value(desc: &MessageDescriptor, depth: usize) -> serde_json::Value {
    if depth > 5 {
        return serde_json::Value::Object(serde_json::Map::new());
    }

    let mut map = serde_json::Map::new();
    // Sort fields by field number to match proto definition order
    let mut fields: Vec<_> = desc.fields().collect();
    fields.sort_by_key(|f| f.number());
    for field in fields {
        if field.is_list() {
            // repeated fields default to empty array
            map.insert(field.name().to_string(), serde_json::json!([]));
        } else if field.is_map() {
            map.insert(field.name().to_string(), serde_json::json!({}));
        } else if matches!(field.kind(), Kind::Message(_)) && depth > 0 {
            // Nested message fields at depth > 0 are omitted (optional)
            // Only include top-level message fields
            continue;
        } else {
            let value = build_field_example(&field, depth);
            map.insert(field.name().to_string(), value);
        }
    }
    serde_json::Value::Object(map)
}

fn build_field_example(field: &FieldDescriptor, depth: usize) -> serde_json::Value {
    match field.kind() {
        Kind::Double | Kind::Float => serde_json::json!(0.0),
        Kind::Int32 | Kind::Sint32 | Kind::Sfixed32 => serde_json::json!(0),
        Kind::Int64 | Kind::Sint64 | Kind::Sfixed64 => serde_json::json!("0"),
        Kind::Uint32 | Kind::Fixed32 => serde_json::json!(0),
        Kind::Uint64 | Kind::Fixed64 => serde_json::json!("0"),
        Kind::Bool => serde_json::json!(false),
        Kind::String => serde_json::json!(""),
        Kind::Bytes => serde_json::json!(""),
        Kind::Enum(enum_desc) => {
            if let Some(first) = enum_desc.values().next() {
                serde_json::json!(first.name())
            } else {
                serde_json::json!(0)
            }
        }
        Kind::Message(msg_desc) => {
            // Handle well-known types
            match msg_desc.full_name() {
                "google.protobuf.Timestamp" => serde_json::json!("1970-01-01T00:00:00Z"),
                "google.protobuf.Duration" => serde_json::json!("0s"),
                "google.protobuf.StringValue" => serde_json::json!(""),
                "google.protobuf.Int32Value" | "google.protobuf.Int64Value" => {
                    serde_json::json!(0)
                }
                "google.protobuf.BoolValue" => serde_json::json!(false),
                "google.protobuf.Struct" => serde_json::json!({}),
                "google.protobuf.Value" => serde_json::json!(null),
                "google.protobuf.Empty" => serde_json::json!({}),
                _ => build_example_value(&msg_desc, depth + 1),
            }
        }
    }
}
