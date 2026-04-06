# Meow

A multi-protocol API client for desktop. Import OpenAPI specs and Proto files from GitHub repositories, then edit, execute, and manage requests — similar to Bruno or Postman.

## Features

- **REST API**: GET / POST / PUT / PATCH / DELETE with variable interpolation, auth inheritance, and environment management
- **gRPC (Unary RPC)**: Native HTTP/2 with TLS support. Parse `.proto` files at runtime — no `protoc` required
- **GitHub Import**: Browse and import OpenAPI (YAML/JSON) and Proto files directly from GitHub repositories
- **Sync from GitHub**: Pull latest spec changes with branch selection. User-edited requests are preserved
- **Workspaces & Collections**: Organize APIs into workspaces with multiple collections
- **Environment Variables**: Define `{{VARIABLE}}` placeholders resolved per environment (dev/stg/prod)
- **Authentication**: Bearer, API Key, Basic Auth, and AWS Cognito (USER_PASSWORD_AUTH). Auth is inherited from parent collection
- **VS Code-style Tabs**: Single click = preview (italic, replaceable), edit/save = pinned. Drag to reorder
- **Syntax-highlighted Editors**: CodeMirror 6 for request body (JSON) and response viewer with variable highlighting in URL bar
- **gRPC Docs Viewer**: Auto-generated field documentation from proto descriptors

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install) (1.77+)
- GitHub OAuth App credentials (see below)

### Setup

1. Clone the repository:

```bash
git clone git@github.com:mr04vv/meow.git
cd meow
pnpm install
```

2. Create `.env` file in the project root (see `.env.example`):

```
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

These are read at build time by `build.rs` via `dotenvy`.

3. Start the development server:

```bash
pnpm tauri dev
```

### Build for Distribution

```bash
pnpm tauri build
```

Output:
- **macOS**: `src-tauri/target/release/bundle/macos/Meow.app` and `.dmg`
- **Zip for sharing**: `cd src-tauri/target/release/bundle/macos && zip -r Meow.zip Meow.app`

> **Note**: The app is not code-signed. macOS may show "Meow is damaged" when opening.
> Run the following command in Terminal to fix this:
> ```bash
> sudo xattr -rd com.apple.quarantine /Applications/Meow.app
> ```

## Usage

### 1. Sign in with GitHub

Click "Sign in with GitHub" on the welcome screen or use the workspace dropdown → "Import from GitHub". This starts an OAuth flow in your browser.

### 2. Import a Collection

**From Workspace dropdown** (creates a new workspace):
1. Open workspace dropdown → "Import from GitHub"
2. Search and select a repository
3. Select a branch
4. Check the spec files you want to import (OpenAPI and/or Proto)
5. Name the collection and click "Generate Collection"

**From Collections + button** (adds to current workspace):
1. Click the `+` button next to "Collections" in the sidebar
2. Click "Import from GitHub"
3. Follow the same flow as above

### 3. Send Requests

**REST:**
1. Click a request in the sidebar
2. Edit the URL, headers, params, and body
3. Click "Send" or press `Cmd+Enter`

**gRPC:**
1. Click a gRPC request (shown with teal "GRPC" badge)
2. Edit the endpoint URL (e.g., `https://grpc.example.com:443`)
3. Edit the JSON request body
4. Click "Send" or press `Cmd+Enter`

### 4. Environment Variables

1. Click a collection in the sidebar to open its settings
2. Create environments (e.g., "local", "staging", "production")
3. Add variable keys (e.g., `BASE_URL`, `GRPC_HOST`)
4. Set values per environment
5. Select the active environment from the header dropdown
6. Use `{{VARIABLE_NAME}}` in URLs, headers, and body — they resolve at send time

### 5. Sync from GitHub

When a collection was imported from GitHub, you can pull the latest changes:

- **From Collection settings**: Select a branch → click "Sync"
- **From Request view**: Use the branch selector + sync button next to Send

Sync respects the `user_edited` flag — requests you've manually modified won't be overwritten.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Enter` | Send request |
| `Cmd+S` | Save request |
| `Cmd+W` | Close active tab |
| `Cmd+A` | Select all (in editor) |

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Rust (Tauri v2)
- **Database**: SQLite (bundled, with versioned migrations)
- **gRPC**: `h2` (HTTP/2) + `prost-reflect` (runtime proto reflection) + `protox` (proto compilation)
- **Editor**: CodeMirror 6

## License

MIT
