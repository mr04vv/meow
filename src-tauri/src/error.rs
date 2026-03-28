use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("HTTP error: {0}")]
    Http(reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Connection refused: {0}")]
    ConnectionRefused(String),

    #[error("Request timeout after {0}ms")]
    Timeout(u64),

    #[error("DNS resolution failed: {0}")]
    DnsError(String),

    #[error("SSL/TLS error: {0}")]
    SslError(String),

    #[error("{0}")]
    Custom(String),
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            // Extract timeout_ms from the error if possible; fall back to a generic message
            AppError::Timeout(0)
        } else if err.is_connect() {
            let msg = err.to_string();
            if msg.contains("dns") || msg.contains("resolve") || msg.contains("lookup") {
                AppError::DnsError(msg)
            } else if msg.contains("Connection refused") || msg.contains("connection refused") {
                AppError::ConnectionRefused(msg)
            } else {
                AppError::Http(err)
            }
        } else if err.is_request() {
            let msg = err.to_string();
            if msg.contains("ssl") || msg.contains("tls") || msg.contains("SSL") || msg.contains("TLS") || msg.contains("certificate") {
                AppError::SslError(msg)
            } else {
                AppError::Http(err)
            }
        } else {
            AppError::Http(err)
        }
    }
}

// Tauri commands require errors to implement Serialize
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
