use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, AeadCore, Nonce,
};
use base64::Engine as _;

use crate::error::AppError;

const NONCE_SIZE: usize = 12;

/// Generate a new random 256-bit encryption key, returned as base64
pub fn generate_key() -> String {
    let key = Aes256Gcm::generate_key(OsRng);
    base64::engine::general_purpose::STANDARD.encode(key)
}

/// Encrypt plaintext using AES-256-GCM.
/// Returns base64-encoded "nonce:ciphertext"
pub fn encrypt(plaintext: &str, key_b64: &str) -> Result<String, AppError> {
    let key_bytes = base64::engine::general_purpose::STANDARD
        .decode(key_b64)
        .map_err(|e| AppError::Custom(format!("Invalid encryption key: {}", e)))?;

    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| AppError::Custom(format!("Failed to create cipher: {}", e)))?;

    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| AppError::Custom(format!("Encryption failed: {}", e)))?;

    // Combine nonce + ciphertext and encode as base64
    let mut combined = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    combined.extend_from_slice(&nonce);
    combined.extend_from_slice(&ciphertext);

    Ok(base64::engine::general_purpose::STANDARD.encode(combined))
}

/// Decrypt base64-encoded "nonce+ciphertext" using AES-256-GCM.
pub fn decrypt(encrypted_b64: &str, key_b64: &str) -> Result<String, AppError> {
    let key_bytes = base64::engine::general_purpose::STANDARD
        .decode(key_b64)
        .map_err(|e| AppError::Custom(format!("Invalid encryption key: {}", e)))?;

    let combined = base64::engine::general_purpose::STANDARD
        .decode(encrypted_b64)
        .map_err(|e| AppError::Custom(format!("Invalid encrypted data: {}", e)))?;

    if combined.len() < NONCE_SIZE {
        return Err(AppError::Custom("Encrypted data too short".into()));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_SIZE);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| AppError::Custom(format!("Failed to create cipher: {}", e)))?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| AppError::Custom("Decryption failed (wrong key or corrupted data)".into()))?;

    String::from_utf8(plaintext)
        .map_err(|e| AppError::Custom(format!("Decrypted data is not valid UTF-8: {}", e)))
}
