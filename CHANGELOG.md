# Changelog

All notable changes to Meow will be documented in this file.

## [Unreleased]

### Added
- **auth_config の AES-256-GCM 暗号化**: Cognito パスワード等の認証情報を暗号化して SQLite に保存。アプリ固有の暗号化キーを初回起動時に自動生成。復号化はデータ読み取り時に自動実行。レガシーデータ（平文）とも後方互換
- **同一 Workspace に Collection 追加**: サイドバーの「+」ボタンから新しい Collection を作成可能。名前を入力して Enter or ボタンクリックで作成
- **レスポンスボディのシンタックスハイライト**: CodeMirror 6 で JSON レスポンスを表示。行番号、折りたたみ、括弧対応、読み取り専用
- **DB マイグレーション機能**: バージョン管理方式のスキーママイグレーション。起動時に未適用のマイグレーションを自動実行。今後のスキーマ変更で DB 削除が不要に

### Changed
- **Cognito 認証: User Pool ID を廃止、Region を直接入力に変更**: User Pool ID は Region 抽出のためだけに必要だったので、Region フィールドに簡素化

### Fixed
- **環境変数の値が別環境で更新できない**: `upsert_variable_value` が毎回新規 INSERT していた問題を修正。既存行があれば UPDATE するように変更
- **インポート時の環境セットアップエラーが無視される**: catch ブロックにログ出力を追加

## [0.1.0] - 2026-03-29

### Added

- **Tauri v2 + React デスクトップアプリ**: Rust バックエンド + React フロントエンドの multi-protocol API client
- **GitHub OAuth 連携**: リポジトリ閲覧、ブランチ選択、OpenAPI ファイル自動検出
- **OpenAPI パース**: OpenAPI 3.0/3.1 + Swagger 2.0 対応。`$ref` の再帰的解決（`components.schemas`, `components.responses`, `components.parameters` 等の全セクション対応）。`allOf`/`oneOf`/`anyOf` のマージ
- **Workspace / Collection モデル（Bruno スタイル）**: Workspace はコンテナ、Collection が環境変数・認証・リクエストを管理
- **複数 YAML インポート**: 1つの Collection 内にサブフォルダとしてリクエストを展開
- **インポート時に local 環境自動作成**: `servers[0].url` を `BASE_URL` 変数に設定、URL は `{{BASE_URL}}` で参照
- **環境変数管理（共通キー + 環境別値）**: キーは Collection 共通で定義、値は環境（local/stg/prod）ごとに異なる。環境切替で値が自動変更
- **Environment Manager ダイアログ**: 環境の作成・削除、変数の追加・編集・削除
- **`{{variable}}` 展開**: URL・ヘッダー値で変数参照。送信時に BE で展開
- **REST リクエスト実行エンジン**: reqwest ベース。タイムアウト、リダイレクト制御、エラー分類（接続拒否/タイムアウト/DNS/SSL）
- **レスポンスビューア**: ステータスコード色分け、ヘッダー表示、JSON pretty print、レスポンスタイム・サイズ
- **OpenAPI Docs タブ**: レスポンスビューア内に Docs タブ。送信前に API 仕様を確認（パラメータ、リクエストボディ、レスポンス定義、セキュリティ）。Schema ツリーの展開表示
- **認証サポート**: Bearer Token / API Key / Basic Auth / AWS Cognito (SRP)
- **Collection レベル Auth 継承**: Collection に設定した認証がリクエストに自動適用。個別上書き可能
- **プレビュータブ（VS Code スタイル）**: シングルクリック→プレビュー（斜体、置換可能）。編集→自動ピン留め。保存→ピン留め
- **Dirty tracking + 未保存マーク**: 変更があるタブに ● 表示。保存で解消
- **タブ閉じ確認ダイアログ**: 未保存タブ閉じ時に「Cancel / Discard / Save & Close」の3択
- **ウィンドウ閉じ確認ダイアログ**: 未保存タブがある場合に確認。タブ名一覧表示
- **リクエスト保存・更新**: Cmd+S で SQLite に保存。既存リクエストは更新、新規は作成
- **CodeMirror 6 エディタ**: JSON ボディにシンタックスハイライト・行番号・括弧対応。URL バーに変数ハイライト（緑=定義済み、オレンジ=未定義）
- **変数ホバーツールチップ**: URL バーの `{{変数}}` にホバーで値を確認・インライン編集。自動保存
- **全幅 URL バー（Bruno スタイル）**: リクエスト/レスポンス分割の上に全幅配置
- **リサイズ可能 3 ペインレイアウト**: サイドバー / リクエストエディタ / レスポンスビューア。ドラッグでサイズ変更
- **ダークモード**: Inter フォント（`@fontsource-variable/inter`）。日本語の斜体は `skewX` で対応
- **キーボードショートカット**: Cmd+Enter=送信、Cmd+S=保存、Cmd+T=新タブ、Cmd+W=タブ閉じ
- **ブランチ検索**: リポジトリ選択ダイアログでブランチをインクリメンタルサーチ
- **Workspace セレクター**: ヘッダーのドロップダウンで切替。検索可能。Import from GitHub をメニュー内に配置
- **E2E テスト（Playwright）**: サイドバーリサイズ、タブ管理、Collection ツリー操作
- **VRT（Visual Regression Test）**: メイン画面・Collection 設定・リクエストエディタのスクリーンショット比較

### Fixed

- **サイドバーリサイズバグ**: `react-resizable-panels` v4 で `defaultSize` を文字列パーセンテージ（`"20%"`）に変更
- **GitHub 検索の `user:@me` 無効問題**: `user:{login}` に修正
- **ページネーション u8 truncation**: `.min(255)` でクランプ
- **親 Collection の折りたたみ不可**: チェブロンクリックで独立トグル
- **Response 定義の非表示**: `$ref` 解決を `components.schemas` だけでなく全セクションから実施
- **Collection 内リクエストが Empty**: tag ベースサブフォルダ廃止、リクエストを直接サブフォルダに格納
- **Nix 環境でのリンカエラー**: `.cargo/config.toml` に `linker = "/usr/bin/cc"` を追加
- **Keychain アクセスダイアログ**: keyring → SQLite 保存に変更
- **ダイアログの背景透過**: overlay 不透明度を調整
- **リポジトリ選択ダイアログのはみ出し**: 固定高さ + ScrollArea + `overflow-hidden`
- **Org リポジトリ非表示**: `type_("owner")` → `type_("all")` に変更
- **保存後に一覧から消える**: `update_request` で `collection_id` を送らないように修正

### Tech Stack

- **Frontend**: React 19, TypeScript, Vite, shadcn/ui, Tailwind CSS v4, TanStack Router, zustand, CodeMirror 6, react-resizable-panels
- **Backend**: Rust, Tauri v2, reqwest, octocrab, rusqlite, serde
- **Testing**: Vitest, Playwright
- **Font**: Inter Variable (`@fontsource-variable/inter`)
