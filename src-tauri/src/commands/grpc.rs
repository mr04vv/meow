use bytes::Bytes;
use h2::client;
use http::Request;
use prost::Message;
use prost_reflect::{DescriptorPool, DynamicMessage};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use tokio::net::TcpStream;

use crate::commands::shared::{self, build_variable_map, interpolate};
use crate::error::AppError;
use crate::storage::DbState;

// TLS support
use tokio_rustls::TlsConnector;
use tokio_rustls::rustls::{ClientConfig, RootCertStore};
use tokio_rustls::rustls::pki_types::ServerName;

// ─── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcRequest {
    pub url: String,
    pub service_name: String,
    pub method_name: String,
    pub metadata: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub request_id: Option<String>,
    pub collection_id: Option<String>,
    pub timeout_ms: Option<u64>,
    pub auth_type: Option<String>,
    pub auth_config: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcResponse {
    pub grpc_status: i32,
    pub grpc_message: String,
    pub headers: HashMap<String, String>,
    pub trailers: HashMap<String, String>,
    pub body: String,
    pub response_time_ms: u64,
    pub body_size_bytes: u64,
    pub is_json: bool,
}

// ─── gRPC execution ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn send_grpc_request(
    state: State<'_, DbState>,
    request: GrpcRequest,
) -> Result<GrpcResponse, AppError> {
    let start = std::time::Instant::now();

    // Phase 1: Sync DB reads (under lock)
    let (proto_descriptor, vars, resolved_auth, db_service_name, db_method_name) = {
        let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        let vars = build_variable_map(&conn, request.collection_id.as_deref());
        let auth = shared::resolve_auth_from_db(
            &conn,
            request.collection_id.as_deref(),
            request.auth_type.as_deref(),
            request.auth_config.as_deref(),
            &vars,
        )?;

        // Load proto descriptor and service/method names from request_grpc_meta
        let (descriptor, svc, meth): (Vec<u8>, String, String) = match &request.request_id {
            Some(rid) => conn
                .query_row(
                    "SELECT proto_descriptor, service_name, method_name FROM request_grpc_meta WHERE request_id = ?1",
                    rusqlite::params![rid],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .map_err(|e| AppError::Custom(format!("gRPC meta not found: {}", e)))?,
            None => return Err(AppError::Custom("request_id is required for gRPC".into())),
        };

        (descriptor, vars, auth, svc, meth)
    };

    // Phase 2: Build protobuf message
    let pool = DescriptorPool::decode(proto_descriptor.as_slice())
        .map_err(|e| AppError::Custom(format!("Failed to decode proto descriptor: {}", e)))?;

    // Use service/method names from DB (full qualified names)
    let service_name = db_service_name;
    let method_name = db_method_name;

    // Find the method descriptor
    let service_desc = pool
        .services()
        .find(|s| s.full_name() == service_name)
        .ok_or_else(|| AppError::Custom(format!("Service '{}' not found in proto", service_name)))?;

    let method_desc = service_desc
        .methods()
        .find(|m| m.name() == method_name)
        .ok_or_else(|| {
            AppError::Custom(format!("Method '{}' not found in service '{}'", method_name, service_name))
        })?;

    let input_desc = method_desc.input();

    // Parse JSON body into DynamicMessage
    let request_message = if let Some(body) = &request.body {
        let expanded = interpolate(body, &vars);
        let mut deserializer = serde_json::Deserializer::from_str(&expanded);
        DynamicMessage::deserialize(input_desc.clone(), &mut deserializer)
            .map_err(|e| AppError::Custom(format!("Failed to parse request body: {}", e)))?
    } else {
        DynamicMessage::new(input_desc.clone())
    };

    // Encode to protobuf bytes
    let message_bytes = request_message.encode_to_vec();

    // gRPC framing: 1 byte compression flag + 4 bytes message length (big-endian)
    let mut grpc_frame = Vec::with_capacity(5 + message_bytes.len());
    grpc_frame.push(0u8); // no compression
    grpc_frame.extend_from_slice(&(message_bytes.len() as u32).to_be_bytes());
    grpc_frame.extend_from_slice(&message_bytes);

    // Phase 3: Send gRPC request via HTTP/2
    let expanded_url = interpolate(&request.url, &vars);
    let (host, port, use_tls) = parse_grpc_url(&expanded_url)?;
    let path = format!("/{}/{}", service_name, method_name);
    let scheme = if use_tls { "https" } else { "http" };

    log::info!("[send_grpc_request] {}://{}:{}{}", scheme, host, port, path);

    // Connect via TCP
    let addr = format!("{}:{}", host, port);
    let tcp = TcpStream::connect(&addr)
        .await
        .map_err(|e| AppError::Custom(format!("Failed to connect to {}: {}", addr, e)))?;

    // HTTP/2 handshake (with or without TLS)
    let (mut h2_client, h2_conn): (client::SendRequest<Bytes>, _) = if use_tls {
        let mut root_store = RootCertStore::empty();
        root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let tls_config = ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_no_client_auth();
        let mut tls_config = tls_config;
        tls_config.alpn_protocols = vec![b"h2".to_vec()];
        let connector = TlsConnector::from(std::sync::Arc::new(tls_config));
        let server_name = ServerName::try_from(host.clone())
            .map_err(|e| AppError::Custom(format!("Invalid server name: {}", e)))?;
        let tls_stream = connector.connect(server_name, tcp)
            .await
            .map_err(|e| AppError::Custom(format!("TLS handshake failed: {}", e)))?;
        let (client, conn) = client::handshake(tls_stream)
            .await
            .map_err(|e| AppError::Custom(format!("HTTP/2 handshake failed: {}", e)))?;
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                log::error!("[send_grpc_request] HTTP/2 connection error: {}", e);
            }
        });
        (client, ())
    } else {
        let (client, conn) = client::handshake(tcp)
            .await
            .map_err(|e| AppError::Custom(format!("HTTP/2 handshake failed: {}", e)))?;
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                log::error!("[send_grpc_request] HTTP/2 connection error: {}", e);
            }
        });
        (client, ())
    };

    // Build HTTP/2 request
    let mut req_builder = Request::builder()
        .method("POST")
        .uri(format!("{}://{}:{}{}", scheme, host, port, path))
        .header("content-type", "application/grpc")
        .header("te", "trailers");

    // Apply auth headers
    for (key, value) in &resolved_auth.headers {
        req_builder = req_builder.header(key.as_str(), value.as_str());
    }

    // Apply user metadata
    if let Some(metadata) = &request.metadata {
        for (key, value) in metadata {
            let expanded = interpolate(value, &vars);
            req_builder = req_builder.header(key.as_str(), expanded.as_str());
        }
    }

    let h2_request = req_builder
        .body(())
        .map_err(|e| AppError::Custom(format!("Failed to build HTTP/2 request: {}", e)))?;

    // Send request
    let (response_future, mut send_stream) = h2_client
        .send_request(h2_request, false)
        .map_err(|e| AppError::Custom(format!("Failed to send gRPC request: {}", e)))?;

    // Send body
    send_stream
        .send_data(Bytes::from(grpc_frame), true)
        .map_err(|e| AppError::Custom(format!("Failed to send request body: {}", e)))?;

    // Await response
    let response = response_future
        .await
        .map_err(|e| AppError::Custom(format!("gRPC response error: {}", e)))?;

    // Read response headers
    let http_status = response.status().as_u16();
    let mut resp_headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(v) = value.to_str() {
            resp_headers.insert(key.to_string(), v.to_string());
        }
    }
    log::info!("[send_grpc_request] HTTP status: {}, headers: {:?}", http_status, resp_headers);

    // Read response body
    let mut body_stream = response.into_body();
    let mut response_data = Vec::new();
    while let Some(chunk) = body_stream.data().await {
        let chunk = chunk.map_err(|e| AppError::Custom(format!("Failed to read response: {}", e)))?;
        response_data.extend_from_slice(&chunk);
        body_stream.flow_control().release_capacity(chunk.len())
            .map_err(|e| AppError::Custom(format!("Flow control error: {}", e)))?;
    }

    // Read trailers
    let mut resp_trailers = HashMap::new();
    if let Some(trailers) = body_stream.trailers()
        .await
        .map_err(|e| AppError::Custom(format!("Failed to read trailers: {}", e)))?
    {
        for (key, value) in trailers.iter() {
            if let Ok(v) = value.to_str() {
                resp_trailers.insert(key.to_string(), v.to_string());
            }
        }
    }

    log::info!("[send_grpc_request] Response body: {} bytes, trailers: {:?}", response_data.len(), resp_trailers);

    // Extract gRPC status — check both headers (Trailers-Only responses) and trailers
    let grpc_status = resp_trailers
        .get("grpc-status")
        .or_else(|| resp_headers.get("grpc-status"))
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(-1);
    let grpc_message = resp_trailers
        .get("grpc-message")
        .or_else(|| resp_headers.get("grpc-message"))
        .cloned()
        .unwrap_or_default();
    // URL-decode the grpc-message (gRPC uses percent-encoding)
    let grpc_message = urlencoding::decode(&grpc_message)
        .unwrap_or(std::borrow::Cow::Borrowed(&grpc_message))
        .to_string();

    // Decode response body
    let body_json = if response_data.len() >= 5 {
        // Strip 5-byte gRPC frame header
        let _compression = response_data[0];
        let msg_len = u32::from_be_bytes([
            response_data[1],
            response_data[2],
            response_data[3],
            response_data[4],
        ]) as usize;
        let msg_bytes = &response_data[5..5 + msg_len.min(response_data.len() - 5)];

        let output_desc = method_desc.output();
        match DynamicMessage::decode(output_desc, msg_bytes) {
            Ok(msg) => {
                serde_json::to_string_pretty(&msg).unwrap_or_else(|_| "{}".to_string())
            }
            Err(e) => format!("{{\"error\": \"Failed to decode response: {}\"}}", e),
        }
    } else if grpc_status != 0 {
        format!("{{\"error\": \"{}\"}}", grpc_message)
    } else {
        "{}".to_string()
    };

    let body_size_bytes = body_json.len() as u64;
    let response_time_ms = start.elapsed().as_millis() as u64;

    Ok(GrpcResponse {
        grpc_status,
        grpc_message,
        headers: resp_headers,
        trailers: resp_trailers,
        body: body_json,
        response_time_ms,
        body_size_bytes,
        is_json: true,
    })
}

/// Parse a gRPC URL like "localhost:50051" or "https://grpc.example.com" into (host, port, use_tls)
fn parse_grpc_url(url: &str) -> Result<(String, u16, bool), AppError> {
    let trimmed = url.trim();
    let (use_tls, stripped) = if let Some(rest) = trimmed.strip_prefix("https://") {
        (true, rest)
    } else if let Some(rest) = trimmed.strip_prefix("http://") {
        (false, rest)
    } else {
        // No scheme: default to plaintext
        (false, trimmed)
    };

    let stripped = stripped.trim_end_matches('/');

    if let Some((host, port_str)) = stripped.rsplit_once(':') {
        if let Ok(port) = port_str.parse::<u16>() {
            return Ok((host.to_string(), port, use_tls));
        }
    }

    // No port specified
    let default_port = if use_tls { 443 } else { 80 };
    Ok((stripped.to_string(), default_port, use_tls))
}
