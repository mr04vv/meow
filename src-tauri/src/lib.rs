mod auth;
mod commands;
pub mod crypto;
mod error;
mod storage;

use commands::collection::{
    create_collection, delete_collection, generate_collection_from_openapi,
    list_collections, mark_request_user_edited,
};
use commands::collection_env::{
    create_collection_environment, list_collection_environments,
    set_active_collection_environment, delete_collection_environment,
    list_variable_keys, create_variable_key, delete_variable_key,
    get_variables_for_env, upsert_variable_value,
    get_active_collection_variables,
    update_collection_auth, get_collection_auth,
};
use commands::request::{
    create_request, delete_request, get_request, get_request_docs, list_requests, resolve_auth,
    update_request,
};
use commands::github::{
    github_auth_status, github_get_file_content, github_get_file_tree,
    github_list_branches, github_list_repos, github_logout, github_start_oauth,
};
use commands::openapi::{detect_openapi_files, parse_openapi};
use commands::cognito::{cognito_authenticate, cognito_get_stored_token, cognito_refresh_token};
use commands::rest::send_rest_request;
use commands::workspace::{
    create_workspace, list_workspaces, get_workspace, delete_workspace,
};
use storage::{init_database, DbState};
use std::sync::Mutex;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let conn = init_database(app.handle())?;
            app.manage(DbState(Mutex::new(conn)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            send_rest_request,
            // Workspace
            create_workspace,
            list_workspaces,
            get_workspace,
            delete_workspace,
            // Collection environments
            create_collection_environment,
            list_collection_environments,
            set_active_collection_environment,
            delete_collection_environment,
            // Collection variable keys
            list_variable_keys,
            create_variable_key,
            delete_variable_key,
            // Collection variable values
            get_variables_for_env,
            upsert_variable_value,
            get_active_collection_variables,
            // Collection auth
            update_collection_auth,
            get_collection_auth,
            // Requests
            create_request,
            list_requests,
            get_request,
            get_request_docs,
            update_request,
            delete_request,
            resolve_auth,
            // GitHub OAuth + API
            github_start_oauth,
            github_auth_status,
            github_logout,
            github_list_repos,
            github_list_branches,
            github_get_file_tree,
            github_get_file_content,
            // OpenAPI
            detect_openapi_files,
            parse_openapi,
            // Collection generation
            create_collection,
            generate_collection_from_openapi,
            mark_request_user_edited,
            list_collections,
            delete_collection,
            // Cognito
            cognito_authenticate,
            cognito_refresh_token,
            cognito_get_stored_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
