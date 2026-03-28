use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Authentication configuration — one variant per auth type
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AuthConfig {
    None,
    BearerToken {
        token: String,
    },
    ApiKey {
        key: String,
        value: String,
        /// "header" or "query"
        placement: String,
    },
    BasicAuth {
        username: String,
        password: String,
    },
}

/// Result of applying auth to a request
pub struct AppliedAuth {
    /// Extra headers to add (e.g. Authorization)
    pub headers: HashMap<String, String>,
    /// Extra query params to add (e.g. api_key=xxx)
    pub query_params: HashMap<String, String>,
}

impl AuthConfig {
    /// Apply the auth config and return headers/query params to inject
    pub fn apply(&self) -> AppliedAuth {
        let mut headers = HashMap::new();
        let mut query_params = HashMap::new();

        match self {
            AuthConfig::None => {}

            AuthConfig::BearerToken { token } => {
                headers.insert("Authorization".to_string(), format!("Bearer {}", token));
            }

            AuthConfig::ApiKey { key, value, placement } => {
                if placement == "query" {
                    query_params.insert(key.clone(), value.clone());
                } else {
                    // default: header
                    headers.insert(key.clone(), value.clone());
                }
            }

            AuthConfig::BasicAuth { username, password } => {
                let credentials = format!("{}:{}", username, password);
                let encoded = base64::engine::general_purpose::STANDARD.encode(credentials.as_bytes());
                headers.insert("Authorization".to_string(), format!("Basic {}", encoded));
            }
        }

        AppliedAuth { headers, query_params }
    }
}
