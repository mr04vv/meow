# Meow MVP 実装計画

## 概要

Meow MVP（P0）の実装計画。Tauri v2 + React + Vite + Rust によるデスクトップ API クライアント。
REST + OpenAPI + GitHub 連携に集中し、GraphQL / gRPC / WebSocket は Phase 2 以降。

---

## マイルストーン構成

並列作業を最大化するため、Rust バックエンドとフロントエンドを独立して進められるように設計。
マイルストーン内のタスクは依存関係がない限り並列実行可能。

---

## Milestone 1: プロジェクトセットアップ

**目的**: 開発基盤を構築し、Tauri IPC で Rust ↔ React の通信が動作する状態にする

- [ ] **1-1**: Tauri v2 + React + Vite + TypeScript プロジェクト作成
  - `create-tauri-app` でスキャフォルド
  - pnpm をパッケージマネージャとして使用
  - `tauri dev` で空のウィンドウが起動することを確認
- [ ] **1-2**: フロントエンド基盤セットアップ
  - shadcn/ui + Tailwind CSS v4 初期化
  - TanStack Router セットアップ（`__root.tsx`, `index.tsx`）
  - zustand インストール
  - パスエイリアス（`@/`）設定
  - ダークモードのテーマ切り替え基盤
- [ ] **1-3**: Rust バックエンド基盤セットアップ
  - Cargo.toml に依存クレート追加（reqwest, octocrab, rusqlite, serde, serde_json, tokio, oauth2, jsonwebtoken, thiserror）
  - モジュール構成作成（commands/, auth/, storage/）
  - Tauri コマンドの基本パターン確立（エラーハンドリング含む）
  - サンプル IPC コマンドで Rust ↔ React 通信確認
- [ ] **1-4**: SQLite 基盤セットアップ
  - rusqlite でDB初期化
  - マイグレーション仕組み作成
  - 初期テーブル定義（requests, environments, collections, auth_configs）

**完了条件**: `tauri dev` で React UI が表示され、ボタンクリックで Rust コマンドが呼ばれ、SQLite にデータが書き込める

---

## Milestone 2: アプリシェル UI + REST リクエスト実行エンジン

**目的**: メイン画面のレイアウトと、REST リクエストの送受信が動作する状態にする

並列作業:
- **フロントエンド**: アプリシェル UI（2-1, 2-2）
- **バックエンド**: REST 実行エンジン（2-3, 2-4）

### フロントエンド

- [ ] **2-1**: アプリシェルレイアウト
  - 3ペインレイアウト（サイドバー / リクエストエディタ / レスポンスビューア）
  - サイドバー: Collection ツリー（空の状態）
  - ヘッダー: Environment セレクター（空の状態）
  - タブ表示（複数リクエストを開ける）
- [ ] **2-2**: リクエストエディタ UI
  - HTTP メソッドセレクター（GET/POST/PUT/PATCH/DELETE）
  - URL 入力フィールド
  - タブ切り替え（Params / Headers / Body / Auth）
  - Params タブ: key-value エディタ（query params）
  - Headers タブ: key-value エディタ
  - Body タブ: JSON エディタ（textarea、将来 Monaco に置換）
  - Auth タブ: 認証方式選択 + 設定フォーム
  - Send ボタン

### バックエンド

- [ ] **2-3**: REST リクエスト実行エンジン（Rust）
  - Tauri コマンド `send_rest_request` の実装
  - reqwest でリクエスト送信
  - 入力: method, url, headers, query_params, body, auth_config
  - 出力: status, headers, body, response_time_ms
  - タイムアウト設定
  - エラーハンドリング（接続エラー、タイムアウト、DNS 解決失敗等）
- [ ] **2-4**: レスポンス表示
  - ステータスコード（色分け: 2xx=緑, 4xx=黄, 5xx=赤）
  - レスポンスヘッダー表示
  - レスポンスボディ（JSON pretty print）
  - レスポンスタイム表示
  - レスポンスサイズ表示

**完了条件**: URL を入力して Send を押すと、REST リクエストが Rust 経由で送信され、レスポンスが表示される。localhost への接続も動作する。

---

## Milestone 3: Environment 管理 + 基本認証 + リクエスト保存

**目的**: 環境切り替え、認証ヘッダー自動付与、リクエストの永続化

並列作業:
- **フロントエンド**: Environment UI + Auth UI（3-1, 3-3）
- **バックエンド**: Environment ストレージ + Auth エンジン（3-2, 3-4, 3-5）

### フロントエンド

- [ ] **3-1**: Environment 管理 UI
  - Environment 作成 / 編集 / 削除ダイアログ
  - 変数一覧（key-value、secret はマスク表示）
  - active environment セレクター（ヘッダー）
  - URL 内の `{{variable}}` をハイライト表示
- [ ] **3-3**: 認証設定 UI
  - Auth タブ内の認証方式セレクター
  - Bearer Token: トークン入力フィールド
  - API Key: key 名 + value + 挿入先（header / query）
  - Basic Auth: username / password 入力
  - 設定が environment 変数を参照可能（`{{token}}`）

### バックエンド

- [ ] **3-2**: Environment ストレージ（Rust）
  - CRUD（SQLite: environments テーブル、variables テーブル）
  - 変数展開エンジン（`{{variable}}` → 実値への置換）
  - リクエスト送信前の変数展開パイプライン
- [ ] **3-4**: 基本認証エンジン（Rust）
  - Bearer Token: Authorization ヘッダー付与
  - API Key: 指定ヘッダー or クエリパラメータに付与
  - Basic Auth: Base64 エンコード + Authorization ヘッダー付与
  - リクエスト送信パイプラインへの認証注入
- [ ] **3-5**: リクエスト保存 / 読み込み（Rust）
  - CRUD（SQLite: requests テーブル）
  - リクエスト定義の保存（method, url, headers, params, body, auth_config）
  - Collection 配下への配置
  - 手動リクエスト作成 → 保存フロー

**完了条件**: Environment を切り替えて base URL が変わる。Bearer Token を設定してリクエストが認証ヘッダー付きで送信される。リクエストを保存・再読み込みできる。

---

## Milestone 4: GitHub 連携 + OpenAPI 検出・パース

**目的**: GitHub にログインし、リポジトリ内の OpenAPI ファイルを検出・パースできる状態にする

並列作業:
- **フロントエンド**: GitHub ログイン UI + Repo 選択 UI（4-1, 4-2）
- **バックエンド**: GitHub OAuth + API 連携 + OpenAPI パーサー（4-3, 4-4, 4-5）

### フロントエンド

- [ ] **4-1**: GitHub ログイン UI
  - ログインボタン（GitHub アイコン）
  - ログイン状態表示（アバター、ユーザー名）
  - ログアウトボタン
- [ ] **4-2**: リポジトリ選択 UI
  - リポジトリ一覧（アイコン、名前、visibility、更新日）
  - 検索フィルター
  - Branch セレクター（ドロップダウン）
  - 検出された OpenAPI ファイル一覧
  - ファイル選択 → Collection 生成への導線
  - 認証設定の入力欄（このリポジトリの API は認証が必要か）

### バックエンド

- [ ] **4-3**: GitHub OAuth 実装（Rust）
  - GitHub OAuth App の Device Flow または Authorization Code Flow
  - Tauri でローカル HTTP サーバーを起動してコールバック受信
  - アクセストークンを OS キーチェーンに保存（keyring クレート）
  - トークンリフレッシュ
- [ ] **4-4**: GitHub API 連携（Rust）
  - octocrab でリポジトリ一覧取得
  - リポジトリ検索
  - ブランチ一覧取得
  - ファイルツリー取得（Tree API）
  - ファイル内容取得（Contents API）
- [ ] **4-5**: OpenAPI ファイル検出 + パース（Rust）
  - ファイルツリーから規約ベースの探索（openapi.yaml/yml, swagger.yaml/yml）
  - OpenAPI 3.0/3.1 + Swagger 2.0 パース
  - パース結果を構造化データとしてフロントエンドに返却
    - paths（endpoint 一覧）
    - schemas（モデル定義）
    - security schemes（認証方式）
    - servers（ベース URL）
  - パースエラーのハンドリング

**完了条件**: GitHub にログインし、リポジトリを選択し、OpenAPI ファイルが自動検出される。パース結果がフロントエンドに渡される。

---

## Milestone 5: API ドキュメント表示 + Collection 自動生成

**目的**: OpenAPI のパース結果から API ドキュメントを表示し、Collection を自動生成する

並列作業:
- **フロントエンド**: API Reference UI + Collection ツリー UI（5-1, 5-2）
- **バックエンド**: Collection 生成ロジック（5-3）

### フロントエンド

- [ ] **5-1**: API リファレンス UI
  - Endpoint 一覧（method バッジ + path + summary）
  - Endpoint 詳細パネル
    - Parameters（path / query / header）
    - Request Body（schema 展開、example 表示）
    - Responses（ステータスコード別、schema 展開）
    - 認証方式の表示
  - Schema 定義の展開表示（$ref 解決）
  - Servers 一覧（base URL の候補）
- [ ] **5-2**: Collection ツリー UI
  - フォルダ構成（tag or path ベース）
  - リクエストアイテム（method バッジ + 名前）
  - クリックでリクエストエディタに展開
  - 右クリックメニュー（複製、削除、名前変更）
  - 手動リクエスト追加ボタン
  - 再同期ボタン

### バックエンド

- [ ] **5-3**: Collection 自動生成（Rust）
  - OpenAPI パース結果から Collection 構造を生成
  - endpoint ごとに request テンプレートを作成
  - tag ベースのフォルダ分け
  - example values の自動挿入
  - SQLite への保存
  - 再同期ロジック（差分検出、ユーザー編集の保護）

**完了条件**: OpenAPI ファイルから API ドキュメントが表示され、Collection が自動生成される。Collection 内のリクエストをクリックするとエディタに展開され、そのまま実行できる。

---

## Milestone 6: 統合テスト + 仕上げ

**目的**: 全機能を統合し、エンドツーエンドの動作確認とUI仕上げを行う

- [ ] **6-1**: エンドツーエンド動作確認
  - GitHub ログイン → リポジトリ選択 → OpenAPI 検出 → Collection 生成 → リクエスト実行の一連のフロー
  - Environment 切り替えでの base URL 変更
  - 認証付きリクエストの送信
  - localhost へのリクエスト
  - 手動リクエスト作成 → 保存 → 再実行
- [ ] **6-2**: UI ブラッシュアップ
  - Loading 状態の表示
  - Error 状態の表示
  - Empty state の表示
  - レスポンシブ対応（ペインのリサイズ）
  - キーボードショートカット（Cmd+Enter で送信、Cmd+S で保存）
- [ ] **6-3**: エラーハンドリング強化
  - ネットワークエラーの分かりやすい表示
  - GitHub API のレート制限対応
  - OpenAPI パースエラーの詳細表示
  - 認証エラーのリカバリー導線

**完了条件**: MVP として一通りの機能が動作し、主要なエラーケースがハンドリングされている

---

## 依存関係グラフ

```
M1 (セットアップ)
├── M2-FE (アプリシェル UI)          ← 並列
├── M2-BE (REST 実行エンジン)        ← 並列
│   └── M3-BE (Environment + Auth + 保存)
│       └── M4-BE (GitHub + OpenAPI パース)
│           └── M5-BE (Collection 生成)
├── M3-FE (Environment UI + Auth UI) ← M2-FE 完了後
│   └── M4-FE (GitHub UI + Repo UI)
│       └── M5-FE (API Docs + Collection ツリー)
└── M6 (統合 + 仕上げ)              ← M5 完了後
```

**並列作業のポイント:**
- M2: フロントエンド（UI レイアウト）とバックエンド（REST エンジン）を同時進行
- M3: フロントエンド（Environment/Auth UI）とバックエンド（ストレージ/認証）を同時進行
- M4: フロントエンド（GitHub UI）とバックエンド（GitHub API/OpenAPI パーサー）を同時進行
- M5: フロントエンド（API Docs UI）とバックエンド（Collection 生成）を同時進行

---

## OpenAPI パーサーの選定

Rust で OpenAPI をパースするクレートの選択肢:

| クレート | OpenAPI 3.0 | OpenAPI 3.1 | Swagger 2.0 | メンテナンス |
|---------|-------------|-------------|-------------|-------------|
| `utoipa` | ✅ | ✅ | ❌ | 活発 |
| `openapiv3` | ✅ | ❌ | ❌ | 低調 |
| `oas3` | ✅ | ✅ | ❌ | 活発 |

**推奨**: `oas3` — OpenAPI 3.0/3.1 に対応。Swagger 2.0 はパース前に変換する方式で対応。
もしくは YAML/JSON を `serde_yaml` / `serde_json` で直接パースし、独自の型定義でハンドリングする方式も検討（柔軟性が高い）。

---

## GitHub OAuth の実装方式

Tauri デスクトップアプリでの GitHub OAuth:

1. GitHub OAuth App を作成（Settings > Developer settings > OAuth Apps）
2. Tauri アプリ内でローカル HTTP サーバーを起動（例: `http://localhost:31574/callback`）
3. ユーザーのデフォルトブラウザで GitHub 認証ページを開く
4. 認証完了後、GitHub がローカルサーバーにリダイレクト
5. コールバックから authorization code を取得
6. authorization code → access token に交換
7. access token を OS キーチェーンに保存

**代替**: GitHub Device Flow（ブラウザリダイレクト不要、コード入力方式）— こちらの方がシンプルだが UX は劣る。

---

## 注意事項

- Tauri v2 の Permissions / Capabilities 設定を忘れないこと（`src-tauri/capabilities/default.json`）
- Rust コマンドのエラー型は `serde::Serialize` を実装する必要がある
- フロントエンドからの `invoke()` は camelCase、Rust 側は snake_case（自動変換される）
- shadcn/ui は Tailwind CSS v4 + OKLCH カラー形式を使用
- TanStack Router はファイルベースルーティング（`src/routes/` 配下）
