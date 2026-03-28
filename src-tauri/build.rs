fn main() {
    // Load .env from project root (parent of src-tauri)
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join(".env");
    if env_path.exists() {
        dotenvy::from_path(&env_path).ok();
    }

    // Tell Cargo to re-run if .env changes
    println!("cargo:rerun-if-changed=../.env");

    // Pass env vars to the compiler so env!() works in source code
    for key in ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] {
        if let Ok(val) = std::env::var(key) {
            println!("cargo:rustc-env={}={}", key, val);
        }
    }

    tauri_build::build()
}
