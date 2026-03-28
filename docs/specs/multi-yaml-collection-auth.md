# 複数 YAML 選択 + Collection 環境設定 + 認証方式設定

## ユーザーストーリー

### Epic: Collection の拡張

#### US-020: 複数 OpenAPI ファイルを1つの Collection にまとめる

**As a** developer
**I want** to select multiple OpenAPI YAML files from a repository and group them into a single Collection
**So that** I can manage related APIs (e.g., microservice endpoints) as one unit

**受け入れ条件**
- リポジトリ選択ダイアログで複数の OpenAPI ファイルをチェックボックスで選択できる
- 選択したファイルが1つの親 Collection にグルーピングされる
- 各 YAML ファイルは親 Collection 内の子 Collection として生成される
- 子 Collection 名は YAML ファイル名から自動生成される（例: `authentication_api.yaml` → `Authentication API`）
- 選択後に「Generate Collection」ボタンで一括生成

---

#### US-021: Collection に Environment 設定を紐づける

**As a** developer
**I want** to configure environment variables (base URL, tokens, etc.) per Collection
**So that** I can switch between local/dev/staging/prod for each API group

**受け入れ条件**
- Collection の設定画面で Environment を選択・作成できる
- Collection に紐づけた Environment の変数がリクエスト実行時に展開される
- Environment は既存のグローバル Environment と同じ仕組み（変数の key-value）
- Collection の Environment はグローバル Environment より優先される（同じキーの場合）
- Environment が未設定の Collection はグローバル Environment を使用する

---

#### US-022: Collection に認証方式を設定する

**As a** developer
**I want** to configure authentication settings per Collection
**So that** all requests in the Collection automatically use the correct auth method

**受け入れ条件**
- Collection の設定画面で認証方式を選択できる
  - None（認証なし）
  - Bearer Token
  - API Key
  - Basic Auth
  - AWS Cognito (User Pool / SRP)
- 認証設定の値は `{{variable}}` で Environment 変数を参照可能
- 各リクエストはデフォルトで Collection の認証を継承する
- リクエスト個別に認証を上書きできる（「Inherit from Collection」チェックボックス）
- API リクエスト送信前に認証フローが自動実行される

---

#### US-023: Cognito User Pool 認証 (SRP)

**As a** developer
**I want** to authenticate via AWS Cognito User Pool using SRP flow
**So that** I can test APIs protected by Cognito without manually obtaining tokens

**受け入れ条件**
- 認証方式に「AWS Cognito」を選択できる
- 設定項目:
  - User Pool ID（例: `ap-northeast-1_xxxxxx`）
  - Client ID（Cognito App Client ID）
  - Username
  - Password
  - Region（User Pool ID から自動推定）
- 「Authenticate」ボタンで SRP フローを実行し、JWT (ID Token / Access Token) を取得
- 取得したトークンを `Authorization: Bearer <token>` ヘッダーに自動付与
- トークンの有効期限を表示し、期限切れ時に自動リフレッシュ
- 全ての設定値は `{{variable}}` で Environment 変数を参照可能

---

## UI/UX 設計

### 1. リポジトリ選択ダイアログの変更

```
┌─────────────────────────────────────────────────────────────────┐
│ 📖 Select Repository                                      [×]  │
├───────────────────────┬─────────────────────────────────────────┤
│ [Search repos...]  🔍 │ 🔀 [main ▼]                            │
│                       │                                         │
│ 🔒 wevox-rest-bff   ←│ OPENAPI FILES                           │
│   BFF repository...   │ ☑ apps/wevox-ai-agent/buf.gen.oa.yaml  │
│ 🔓 atrae-ui           │ ☑ openapi/references/auth_api.yaml     │
│   デザインシステム...    │ ☐ openapi/references/canvas_api.yaml   │
│ ...                   │ ☑ openapi/references/core_api.yaml     │
│                       │ ☐ openapi/references/common_api.yaml   │
│                       │ ...                                     │
│                       ├─────────────────────────────────────────┤
│                       │ COLLECTION NAME                         │
│                       │ [wevox-rest-bff APIs         ]          │
│                       │                                         │
│                       │ Selected: 3 files                       │
│                       │                                         │
│                       │          [Cancel]  [Generate Collection] │
└───────────────────────┴─────────────────────────────────────────┘
```

変更点:
- OpenAPI ファイルリストにチェックボックスを追加（複数選択）
- 下部に Collection 名入力フィールドを追加
- 「Generate Collection」ボタンで一括生成
- 選択数の表示

### 2. Collection 設定パネル（サイドバー内）

Collection 名の右クリックメニューまたはギアアイコンから開く:

```
┌─────────────────────────────────────┐
│ ⚙ Collection Settings              │
├─────────────────────────────────────┤
│ Name: [wevox-rest-bff APIs    ]     │
│                                     │
│ ── Environment ──────────────────── │
│ [Select Environment ▼]             │
│ (or use global environment)         │
│                                     │
│ ── Authentication ───────────────── │
│ [AWS Cognito ▼]                    │
│                                     │
│ User Pool ID:                       │
│ [{{COGNITO_POOL_ID}}          ]     │
│                                     │
│ Client ID:                          │
│ [{{COGNITO_CLIENT_ID}}        ]     │
│                                     │
│ Username:                           │
│ [{{COGNITO_USERNAME}}         ]     │
│                                     │
│ Password:                           │
│ [{{COGNITO_PASSWORD}}         ]     │
│                                     │
│ [🔑 Authenticate]  ✅ Valid (58m)   │
│                                     │
│          [Cancel]  [Save]           │
└─────────────────────────────────────┘
```

### 3. リクエストエディタの Auth タブ変更

```
Auth タブ:
┌──────────────────────────────────────┐
│ ☑ Inherit from Collection            │
│   Using: AWS Cognito (wevox-rest-bff)│
│   Token: ✅ Valid (58m remaining)    │
│                                      │
│ ─── or override ─────────────────── │
│ ☐ Use custom auth                    │
│   [Bearer Token ▼]                   │
│   Token: [...                    ]   │
└──────────────────────────────────────┘
```

### 4. 認証方式の選択 UI

ドロップダウンで選択:
- None
- Bearer Token → Token 入力
- API Key → Key名 + Value + 挿入先 (Header/Query)
- Basic Auth → Username + Password
- AWS Cognito → User Pool ID + Client ID + Username + Password + Region

全フィールドで `{{variable}}` のハイライトと補完をサポート。

---

## 技術設計

### Rust バックエンド

#### 新規コマンド

```
cognito_authenticate(user_pool_id, client_id, username, password, region)
  → { id_token, access_token, refresh_token, expires_in }

cognito_refresh_token(user_pool_id, client_id, refresh_token, region)
  → { id_token, access_token, expires_in }
```

#### Cargo.toml 追加

```toml
aws-sdk-cognitoidentityprovider = "1"
aws-config = "1"
```

#### Collection テーブル拡張

```sql
ALTER TABLE collections ADD COLUMN auth_type TEXT;
ALTER TABLE collections ADD COLUMN auth_config TEXT DEFAULT '{}';
ALTER TABLE collections ADD COLUMN environment_id TEXT REFERENCES environments(id);
```

### フロントエンド

#### Store 変更
- `collectionStore` に `updateCollectionAuth`, `updateCollectionEnvironment` を追加
- `requestStore` の `handleSend` で Collection の認証を継承するロジックを追加

#### 新規コンポーネント
- `CollectionSettingsDialog` — Collection の設定ダイアログ
- `CognitoAuthForm` — Cognito 認証フォーム
- `AuthMethodSelector` — 認証方式のドロップダウン + 各方式のフォーム

---

## 実装順序

1. **リポジトリ選択ダイアログの複数選択対応** — チェックボックス + 親 Collection 生成
2. **Collection 設定ダイアログ** — 認証方式選択 + Environment 紐づけ UI
3. **Cognito SRP 認証** — Rust バックエンド + フロントエンド
4. **リクエスト実行時の認証継承** — Collection Auth → リクエスト Auth のフォールバック
5. **トークンリフレッシュ** — 有効期限監視 + 自動更新
