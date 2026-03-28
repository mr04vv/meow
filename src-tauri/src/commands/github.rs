use base64::Engine as _;
use octocrab::Octocrab;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

use crate::error::AppError;
use crate::storage::DbState;

// ─── Constants ────────────────────────────────────────────────────────────────

const OAUTH_CALLBACK_PORT: u16 = 9876;
const OAUTH_CALLBACK_PATH: &str = "/callback";

/// Injected at compile time via environment variables.
/// Build with: GITHUB_CLIENT_ID=xxx GITHUB_CLIENT_SECRET=xxx pnpm tauri build
const GITHUB_CLIENT_ID: &str = env!("GITHUB_CLIENT_ID");
const GITHUB_CLIENT_SECRET: &str = env!("GITHUB_CLIENT_SECRET");

// ─── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct GithubRepo {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub private: bool,
    pub default_branch: String,
    pub html_url: String,
}

#[derive(Debug, Serialize)]
pub struct GithubBranch {
    pub name: String,
    pub sha: String,
}

#[derive(Debug, Serialize)]
pub struct GithubTreeEntry {
    pub path: String,
    pub r#type: String, // "blob" | "tree"
    pub sha: String,
    pub size: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct GithubFileContent {
    pub path: String,
    pub content: String,
    pub sha: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct AuthStatus {
    pub authenticated: bool,
    pub login: Option<String>,
}

// ─── Token storage (SQLite) ───────────────────────────────────────────────────

fn save_token(conn: &rusqlite::Connection, token: &str, username: Option<&str>) -> Result<(), AppError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string();
    conn.execute(
        "INSERT OR REPLACE INTO github_auth (id, access_token, username, created_at) VALUES ('default', ?1, ?2, ?3)",
        rusqlite::params![token, username, now],
    )?;
    Ok(())
}

fn load_token(conn: &rusqlite::Connection) -> Result<Option<String>, AppError> {
    match conn.query_row(
        "SELECT access_token FROM github_auth WHERE id = 'default'",
        [],
        |row| row.get::<_, String>(0),
    ) {
        Ok(token) => Ok(Some(token)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

fn delete_token(conn: &rusqlite::Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM github_auth WHERE id = 'default'", [])?;
    Ok(())
}

fn build_octocrab(token: &str) -> Result<Octocrab, AppError> {
    Octocrab::builder()
        .personal_token(token.to_string())
        .build()
        .map_err(|e| AppError::Custom(format!("Failed to build GitHub client: {}", e)))
}

// ─── OAuth flow (OAuth App + Client Secret) ──────────────────────────────────

/// Start the GitHub OAuth Authorization Code Flow.
/// Opens the browser to GitHub's authorization page, waits for the callback,
/// exchanges the code for a token, and stores it in the system keyring.
#[tauri::command]
pub async fn github_start_oauth(state: State<'_, DbState>) -> Result<AuthStatus, AppError> {
    let redirect_uri = format!("http://localhost:{}{}", OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH);
    let auth_url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=repo",
        urlencoding::encode(GITHUB_CLIENT_ID),
        urlencoding::encode(&redirect_uri),
    );

    open::that(&auth_url).map_err(|e| AppError::Custom(format!("Failed to open browser: {}", e)))?;

    let code = wait_for_oauth_callback().await?;
    let token = exchange_code_for_token(&code, &redirect_uri).await?;

    let octo = build_octocrab(&token)?;
    let user = octo
        .current()
        .user()
        .await
        .map_err(|e| AppError::Custom(format!("GitHub API error: {}", e)))?;

    {
        let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        save_token(&conn, &token, Some(&user.login))?;
    }

    Ok(AuthStatus {
        authenticated: true,
        login: Some(user.login),
    })
}

/// Check whether a stored GitHub token exists and is valid
#[tauri::command]
pub async fn github_auth_status(state: State<'_, DbState>) -> Result<AuthStatus, AppError> {
    let token = {
        let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        load_token(&conn)?
    };

    let Some(token) = token else {
        return Ok(AuthStatus { authenticated: false, login: None });
    };

    let octo = build_octocrab(&token)?;
    match octo.current().user().await {
        Ok(user) => Ok(AuthStatus {
            authenticated: true,
            login: Some(user.login),
        }),
        Err(_) => {
            if let Ok(conn) = state.0.lock() {
                let _ = delete_token(&conn);
            }
            Ok(AuthStatus { authenticated: false, login: None })
        }
    }
}

/// Remove the stored GitHub token (logout)
#[tauri::command]
pub async fn github_logout(state: State<'_, DbState>) -> Result<(), AppError> {
    {
        let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        delete_token(&conn)?;
    }
    Ok(())
}

/// Spin up a local TCP listener, wait for the OAuth callback, return the `code`
async fn wait_for_oauth_callback() -> Result<String, AppError> {
    let listener = TcpListener::bind(format!("127.0.0.1:{}", OAUTH_CALLBACK_PORT))
        .await
        .map_err(|e| AppError::Custom(format!("Failed to bind callback port {}: {}", OAUTH_CALLBACK_PORT, e)))?;

    let (tx, rx) = oneshot::channel::<Result<String, AppError>>();

    tokio::spawn(async move {
        let result = async {
            let (mut stream, _) = listener
                .accept()
                .await
                .map_err(|e| AppError::Custom(format!("Callback accept error: {}", e)))?;

            let mut buf = vec![0u8; 4096];
            let n = stream
                .read(&mut buf)
                .await
                .map_err(|e| AppError::Custom(format!("Callback read error: {}", e)))?;
            let request = String::from_utf8_lossy(&buf[..n]);

            let code = parse_code_from_request(&request)
                .ok_or_else(|| AppError::Custom("No code in OAuth callback".into()))?;

            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n\
                <html><body><h2>Authorization successful!</h2>\
                <p>You can close this tab and return to Meow.</p></body></html>";
            let _ = stream.write_all(response.as_bytes()).await;

            Ok::<String, AppError>(code)
        }
        .await;

        let _ = tx.send(result);
    });

    rx.await
        .map_err(|_| AppError::Custom("OAuth callback channel closed".into()))?
}

fn parse_code_from_request(request: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for part in query.split('&') {
        if let Some(code) = part.strip_prefix("code=") {
            return Some(urlencoding::decode(code).unwrap_or_default().into_owned());
        }
    }
    None
}

async fn exchange_code_for_token(
    code: &str,
    redirect_uri: &str,
) -> Result<String, AppError> {
    #[derive(Deserialize)]
    struct TokenResponse {
        access_token: Option<String>,
        error: Option<String>,
        error_description: Option<String>,
    }

    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "client_id": GITHUB_CLIENT_ID,
            "client_secret": GITHUB_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
        }))
        .send()
        .await
        .map_err(AppError::from)?;

    let body: TokenResponse = resp.json().await.map_err(AppError::from)?;

    body.access_token.ok_or_else(|| {
        AppError::Custom(format!(
            "Token exchange failed: {}",
            body.error_description.or(body.error).unwrap_or_default()
        ))
    })
}

// ─── GitHub API commands ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn github_list_repos(
    state: State<'_, DbState>,
    query: Option<String>,
    page: Option<u32>,
) -> Result<Vec<GithubRepo>, AppError> {
    let token = {
        let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        load_token(&conn)?.ok_or_else(|| AppError::Custom("Not authenticated".into()))?
    };
    let octo = build_octocrab(&token)?;

    let repos = if let Some(q) = query {
        // Search across all repos the user can access (personal + org)
        let page_num = page.unwrap_or(1).min(255) as u8;
        let result = octo
            .search()
            .repositories(&q)
            .page(page_num)
            .per_page(30)
            .send()
            .await
            .map_err(|e| AppError::Custom(format!("GitHub search error: {}", e)))?;

        result
            .items
            .into_iter()
            .map(|r| GithubRepo {
                id: r.id.0,
                name: r.name,
                full_name: r.full_name.unwrap_or_default(),
                description: r.description,
                private: r.private.unwrap_or(false),
                default_branch: r.default_branch.unwrap_or_else(|| "main".into()),
                html_url: r.html_url.map(|u| u.to_string()).unwrap_or_default(),
            })
            .collect()
    } else {
        // "all" includes owner, collaborator, and org member repos
        let result = octo
            .current()
            .list_repos_for_authenticated_user()
            .type_("all")
            .sort("updated")
            .per_page(30)
            .page(page.unwrap_or(1).min(255) as u8)
            .send()
            .await
            .map_err(|e| AppError::Custom(format!("GitHub API error: {}", e)))?;

        result
            .items
            .into_iter()
            .map(|r| GithubRepo {
                id: r.id.0,
                name: r.name,
                full_name: r.full_name.unwrap_or_default(),
                description: r.description,
                private: r.private.unwrap_or(false),
                default_branch: r.default_branch.unwrap_or_else(|| "main".into()),
                html_url: r.html_url.map(|u| u.to_string()).unwrap_or_default(),
            })
            .collect()
    };

    Ok(repos)
}

#[tauri::command]
pub async fn github_list_branches(
    state: State<'_, DbState>,
    owner: String,
    repo: String,
) -> Result<Vec<GithubBranch>, AppError> {
    let token = {
        let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        load_token(&conn)?.ok_or_else(|| AppError::Custom("Not authenticated".into()))?
    };
    let octo = build_octocrab(&token)?;

    // Fetch all branches with pagination
    let mut all_branches = Vec::new();
    let mut page: u8 = 1;
    loop {
        let branches = octo
            .repos(&owner, &repo)
            .list_branches()
            .per_page(100)
            .page(page)
            .send()
            .await
            .map_err(|e| AppError::Custom(format!("GitHub API error: {}", e)))?;

        let items = branches.items;
        let count = items.len();
        for b in items {
            all_branches.push(GithubBranch {
                name: b.name,
                sha: b.commit.sha,
            });
        }

        if count < 100 {
            break;
        }
        page = page.saturating_add(1);
        if page > 10 {
            break; // Safety limit: max 1000 branches
        }
    }

    Ok(all_branches)
}

#[tauri::command]
pub async fn github_get_file_tree(
    state: State<'_, DbState>,
    owner: String,
    repo: String,
    tree_sha: String,
    recursive: Option<bool>,
) -> Result<Vec<GithubTreeEntry>, AppError> {
    let token = {
        let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        load_token(&conn)?.ok_or_else(|| AppError::Custom("Not authenticated".into()))?
    };

    #[derive(Deserialize)]
    struct TreeResponse {
        tree: Vec<TreeItem>,
    }

    #[derive(Deserialize)]
    struct TreeItem {
        path: Option<String>,
        r#type: Option<String>,
        sha: Option<String>,
        size: Option<u64>,
    }

    let recursive_param = if recursive.unwrap_or(true) { "1" } else { "0" };
    let url = format!(
        "https://api.github.com/repos/{}/{}/git/trees/{}?recursive={}",
        owner, repo, tree_sha, recursive_param
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "meow-app/0.1")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(AppError::from)?;

    if !resp.status().is_success() {
        let status = resp.status();
        let msg = resp.text().await.unwrap_or_default();
        return Err(AppError::Custom(format!("GitHub API error {}: {}", status, msg)));
    }

    let tree_resp: TreeResponse = resp.json().await.map_err(AppError::from)?;

    Ok(tree_resp
        .tree
        .into_iter()
        .map(|item| GithubTreeEntry {
            path: item.path.unwrap_or_default(),
            r#type: item.r#type.unwrap_or_default(),
            sha: item.sha.unwrap_or_default(),
            size: item.size,
        })
        .collect())
}

#[tauri::command]
pub async fn github_get_file_content(
    state: State<'_, DbState>,
    owner: String,
    repo: String,
    path: String,
    git_ref: Option<String>,
) -> Result<GithubFileContent, AppError> {
    let token = {
        let conn = state.0.lock().map_err(|_| AppError::Custom("DB lock poisoned".into()))?;
        load_token(&conn)?.ok_or_else(|| AppError::Custom("Not authenticated".into()))?
    };
    let octo = build_octocrab(&token)?;

    let repo_handler = octo.repos(&owner, &repo);
    let mut handler = repo_handler.get_content().path(&path);
    if let Some(r) = git_ref {
        handler = handler.r#ref(r);
    }

    let content_items = handler
        .send()
        .await
        .map_err(|e| AppError::Custom(format!("GitHub API error: {}", e)))?;

    let item = content_items
        .items
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Custom(format!("File not found: {}", path)))?;

    let raw_content = item.content.unwrap_or_default();
    let cleaned = raw_content.replace('\n', "").replace('\r', "");
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(cleaned.as_bytes())
        .map_err(|e| AppError::Custom(format!("Base64 decode error: {}", e)))?;
    let content = String::from_utf8_lossy(&decoded).into_owned();

    Ok(GithubFileContent {
        path: item.path,
        content,
        sha: item.sha,
        size: item.size as u64,
    })
}
