# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Meow?

Meow is a multi-protocol API client built with **Tauri v2 (Rust) + React (TypeScript)**. It imports OpenAPI specs from GitHub repositories and provides request editing, execution, and documentation viewing — similar to Bruno or Postman.

## Build & Run Commands

```bash
# Prerequisites: .env file with GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
# See .env.example for format. build.rs reads these via dotenvy.

# Development (launches Tauri desktop app)
pnpm tauri dev

# Frontend only (browser, uses tauri-mock)
pnpm dev

# Build checks
pnpm build                    # TypeScript + Vite build
cargo check                   # Rust check (from src-tauri/)

# Tests
pnpm test                     # Vitest unit tests
pnpm test:e2e                 # Playwright E2E (uses pnpm dev:e2e with mocks)

# E2E uses test-e2e vite mode which aliases @tauri-apps/api to mock files
```

## Architecture

### Data Model (Bruno-style hierarchy)

```
Workspace (container, selected in header dropdown)
└── Collection (owns Environments + Auth, click → settings view)
    ├── Environments (dev/stg/prod — shared keys, per-env values)
    ├── Auth (Bearer/API Key/Basic/Cognito — encrypted with AES-256-GCM)
    └── Subfolders (from OpenAPI YAML files)
        └── Requests
```

### Backend (Rust — `src-tauri/src/`)

- **`commands/`** — Tauri IPC commands. Each module exposes `#[tauri::command]` functions registered in `lib.rs`.
  - `rest.rs` — Request execution. Resolves `{{variables}}` and auth by walking `parent_id` chain to find root Collection's active environment and auth config. Cognito auth is re-authenticated on every request.
  - `collection.rs` — Collection CRUD + OpenAPI→request generation
  - `collection_env.rs` — Environment/variable CRUD. Variables use shared keys (`collection_variable_keys`) with per-environment values (`collection_variable_values`).
  - `openapi.rs` — OpenAPI 3.0/3.1 + Swagger 2.0 parser. `$ref` resolved recursively from all `components` sections.
  - `github.rs` — OAuth (Authorization Code Flow) + repo/branch/file API. Token stored in SQLite (not keychain).
  - `cognito.rs` — Cognito USER_PASSWORD_AUTH flow
  - `workspace.rs` — Simple Workspace CRUD
  - `request.rs` — Request CRUD
- **`storage/database.rs`** — SQLite init with versioned migrations. Schema version tracked in `app_config`. Add new migrations to the `MIGRATIONS` array.
- **`crypto.rs`** — AES-256-GCM encryption for auth_config. Key stored in `app_config` table.
- **`auth/mod.rs`** — `AuthConfig` enum (Bearer/ApiKey/Basic) with `apply()` method.

### Frontend (React — `src/`)

- **Stores (zustand)** — `workspaceStore`, `collectionStore`, `requestStore`, `githubStore`. Stores call Tauri `invoke()` for all data operations.
- **Key components:**
  - `RequestUrlBar` — Full-width URL bar with CodeMirror (variable highlighting + hover tooltips)
  - `RequestEditor` — Params/Headers/Body(CodeMirror JSON)/Auth tabs
  - `ResponseViewer` — Response tab + Docs tab (OpenAPI spec viewer)
  - `CollectionView` — Collection settings (Environments + Auth)
  - `Sidebar` — Collection tree with preview/pinned tab behavior
- **Tab behavior (VS Code-style):** Single click → preview (italic/skew, replaceable). Edit or save → pinned. Dirty tracking with ● indicator and close confirmation.

### Key Patterns

- **Parent chain resolution:** Both variable expansion and auth inheritance walk up `parent_id` to find the root Collection. Subfolders don't have their own env/auth.
- **Serde naming:** `RestRequest`/`RestResponse` use `#[serde(rename_all = "camelCase")]`. FE must send camelCase keys (`collectionId`, `queryParams`).
- **Auth encryption:** `auth_config` is encrypted on save (`update_collection_auth`) and decrypted on read (`get_collection_auth`). `list_collections` returns encrypted data — use `get_collection_auth` for decrypted values.
- **Tauri mock:** `src/lib/tauri-mock.ts` provides mock data for browser-only dev and E2E tests. Aliased via vite config in `test-e2e` mode.
- **macOS linker:** `.cargo/config.toml` sets `linker = "/usr/bin/cc"` to work around Nix/Homebrew GCC conflicts.

### DB Migrations

Add new migrations to `MIGRATIONS` array in `src-tauri/src/storage/database.rs`:
```rust
Migration {
    version: 2,
    description: "Add column",
    sql: "ALTER TABLE collections ADD COLUMN new_col TEXT;",
},
```
Schema version is auto-tracked. No DB deletion needed for future changes.

### CHANGELOG

Update `CHANGELOG.md` `[Unreleased]` section when adding features or fixing bugs.
