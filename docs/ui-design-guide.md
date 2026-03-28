# Meow UI/UX デザインガイド

Meow はマルチプロトコル対応のデスクトップ API クライアント。本ガイドは Tauri v2 + React + shadcn/ui + Tailwind CSS v4 環境でのフロントエンド実装の指針を定める。

参考アプリ: Postman, Insomnia, Bruno, Hoppscotch

---

## 1. レイアウト設計

### 1.1 全体構成

アプリは **ヘッダーバー + 3 ペインレイアウト** で構成する。

```
┌─────────────────────────────────────────────────────────┐
│  Header Bar (h-12)                                      │
│  [Logo] [Env Selector] [spacer] [GitHub User] [Settings]│
├────────────┬────────────────────┬───────────────────────┤
│  Sidebar   │  Request Editor    │  Response Viewer      │
│  (w-64)    │  (flex-1)          │  (flex-1)             │
│            │                    │                       │
│  Collection│  URL Bar           │  Status / Time / Size │
│  Tree      │  Tabs:             │  Tabs:                │
│            │   Params           │   Body                │
│            │   Headers          │   Headers             │
│            │   Body             │   Cookies             │
│            │   Auth             │                       │
│            │                    │                       │
├────────────┴────────────────────┴───────────────────────┤
│  Status Bar (h-8, optional)                             │
└─────────────────────────────────────────────────────────┘
```

### 1.2 サイズと比率

| 領域 | 初期サイズ | 最小サイズ | リサイズ |
|------|-----------|-----------|---------|
| ヘッダーバー | `h-12` (48px) | 固定 | 不可 |
| サイドバー | `w-64` (256px) | `w-48` (192px) | ドラッグで幅変更可能 |
| リクエストエディタ | `flex-1` (残り幅の50%) | `min-w-[320px]` | ドラッグで幅変更可能 |
| レスポンスビューア | `flex-1` (残り幅の50%) | `min-w-[320px]` | ドラッグで幅変更可能 |

### 1.3 リサイズ動作

- サイドバーとメインエリアの境界、リクエストエリアとレスポンスエリアの境界にリサイズハンドルを配置
- `react-resizable-panels` ライブラリを使用（shadcn/ui の Resizable コンポーネントが内部で使用）
- サイドバーは折りたたみ可能（`Cmd+B` でトグル）
- レスポンスビューアは下部に配置する縦分割レイアウトへの切り替えも将来的に検討

```tsx
// shadcn/ui の ResizablePanelGroup を使用
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

<ResizablePanelGroup direction="horizontal">
  <ResizablePanel defaultSize={20} minSize={15}>
    {/* Sidebar */}
  </ResizablePanel>
  <ResizableHandle />
  <ResizablePanel defaultSize={40} minSize={25}>
    {/* Request Editor */}
  </ResizablePanel>
  <ResizableHandle />
  <ResizablePanel defaultSize={40} minSize={25}>
    {/* Response Viewer */}
  </ResizablePanel>
</ResizablePanelGroup>
```

### 1.4 ヘッダーバー

```
[Cat Icon + "Meow"] [Environment Select ▼] ──────── [GitHub Avatar + Name ▼] [⚙]
```

- 左: アプリロゴ（猫アイコン + "Meow" テキスト）
- 中左: Environment セレクター（shadcn `Select`）
- 右: GitHub ユーザー情報（アバター + ユーザー名、ログイン前は "Sign in with GitHub" ボタン）
- 右端: 設定ボタン（`Settings` アイコン）

### 1.5 タブシステム

リクエストエディタ上部に、開いているリクエストのタブを表示する。

- shadcn `Tabs` をカスタマイズして使用
- 各タブ: HTTP メソッドバッジ + リクエスト名 + 閉じるボタン（`X` アイコン）
- 未保存の変更がある場合、タブ名の横にドットインジケーター表示
- タブのドラッグ&ドロップによる並び替えは Phase 2 以降
- `Cmd+W` でアクティブタブを閉じる
- `Cmd+T` または `Cmd+N` で新しいリクエストタブを開く

```
┌──────────────┬───────────────┬──────────────┬────┐
│ GET /users ✕ │ POST /login ● ✕│ GET /items ✕ │ +  │
└──────────────┴───────────────┴──────────────┴────┘
```

---

## 2. カラーパレットとテーマ

### 2.1 テーマ基盤

- shadcn/ui のデフォルトテーマ（neutral ベース）を使用
- **ダークモードをデフォルト** とする（API ツールの慣習に合わせる）
- Tailwind CSS v4 の OKLCH カラー形式を使用
- ライトモード対応は `class` 方式（`<html class="dark">`）

### 2.2 ベースカラー（shadcn/ui neutral テーマ）

ダークモードの主要な CSS 変数:

```css
/* globals.css - shadcn/ui のデフォルト neutral テーマ */
:root.dark {
  --background: oklch(0.145 0 0);        /* ほぼ黒 */
  --foreground: oklch(0.985 0 0);        /* ほぼ白 */
  --card: oklch(0.145 0 0);
  --card-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --border: oklch(0.269 0 0);
  --input: oklch(0.269 0 0);
  --ring: oklch(0.556 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.396 0.141 25.723);
  --destructive-foreground: oklch(0.637 0.237 25.331);
}
```

### 2.3 HTTP メソッドバッジカラー

各 HTTP メソッドに固有の色を割り当てる。バッジは `rounded-sm px-1.5 py-0.5 text-xs font-bold` のスタイルで統一。

| メソッド | 背景色 | テキスト色 | Tailwind クラス例 |
|---------|--------|-----------|------------------|
| **GET** | 緑 | 白 | `bg-emerald-600 text-white` |
| **POST** | 青 | 白 | `bg-blue-600 text-white` |
| **PUT** | オレンジ | 白 | `bg-orange-600 text-white` |
| **PATCH** | 紫 | 白 | `bg-purple-600 text-white` |
| **DELETE** | 赤 | 白 | `bg-red-600 text-white` |
| **OPTIONS** | グレー | 白 | `bg-zinc-600 text-white` |
| **HEAD** | グレー | 白 | `bg-zinc-600 text-white` |

```tsx
// HTTP メソッドバッジコンポーネントの例
const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-600 text-white",
  POST: "bg-blue-600 text-white",
  PUT: "bg-orange-600 text-white",
  PATCH: "bg-purple-600 text-white",
  DELETE: "bg-red-600 text-white",
  OPTIONS: "bg-zinc-600 text-white",
  HEAD: "bg-zinc-600 text-white",
}
```

### 2.4 ステータスコードカラー

レスポンスのステータスコード表示に使用する色:

| ステータス範囲 | 色 | 意味 | Tailwind クラス例 |
|--------------|-----|------|------------------|
| **1xx** | グレー | 情報 | `text-zinc-400` |
| **2xx** | 緑 | 成功 | `text-emerald-400` |
| **3xx** | 青 | リダイレクト | `text-blue-400` |
| **4xx** | 黄 | クライアントエラー | `text-yellow-400` |
| **5xx** | 赤 | サーバーエラー | `text-red-400` |

ステータスコードは `font-mono font-bold text-lg` で表示し、視認性を高める。

---

## 3. コンポーネント仕様

### 3.1 サイドバー（Collection ツリー）

**使用コンポーネント**: shadcn `Sidebar`

```
┌─────────────────┐
│ 🔍 Search...    │
├─────────────────┤
│ ▼ Pet Store API │
│   ▼ pets        │
│     GET  /pets  │
│     POST /pets  │
│     GET  /pets/{│
│   ▶ store       │
│   ▶ user        │
├─────────────────┤
│ ▶ My Collection │
├─────────────────┤
│ + New Request   │
│ + Import OpenAPI│
└─────────────────┘
```

構成:
- **ヘッダー**: 検索バー（`Input` + `Search` アイコン）でリクエストをフィルタリング
- **コンテンツ**: Collection ツリー（`Collapsible` で折りたたみ可能なフォルダ構造）
- **フッター**: "New Request" ボタン、"Import OpenAPI" ボタン
- ツリーアイテムには HTTP メソッドバッジ + エンドポイントパスを表示
- 右クリックで `ContextMenu`（複製、削除、名前変更）
- ドラッグ&ドロップによる並び替えは Phase 2 以降

```tsx
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
```

### 3.2 URL バー

**使用コンポーネント**: shadcn `Select` + `Input` + `Button`（カスタム組み合わせ）

```
┌────────┬──────────────────────────────────────┬────────┐
│ GET  ▼ │ https://api.example.com/v1/users     │  Send  │
└────────┴──────────────────────────────────────┴────────┘
```

- メソッドセレクター: shadcn `Select`、幅固定 `w-24`、メソッドに応じてテキスト色を変更
- URL 入力: `Input`、`font-mono` を適用、`{{variable}}` をハイライト表示
- Send ボタン: shadcn `Button` variant="default"、`Cmd+Enter` でも送信可能
- 全体を `flex` でまとめ、`border rounded-lg` で囲む（一体感のあるデザイン）

```tsx
<div className="flex items-center border rounded-lg overflow-hidden">
  <Select>
    <SelectTrigger className="w-24 border-0 border-r rounded-none">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {/* GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD */}
    </SelectContent>
  </Select>
  <Input
    className="flex-1 border-0 rounded-none font-mono"
    placeholder="Enter URL or paste cURL"
  />
  <Button className="rounded-none">
    <Send className="mr-2 h-4 w-4" /> Send
  </Button>
</div>
```

### 3.3 リクエストエディタ

**使用コンポーネント**: shadcn `Tabs`

URL バーの下に配置する 4 つのタブ:

| タブ名 | 内容 | 詳細 |
|--------|------|------|
| **Params** | クエリパラメータ | Key-Value エディタ |
| **Headers** | リクエストヘッダー | Key-Value エディタ |
| **Body** | リクエストボディ | Content-Type セレクター + エディタ |
| **Auth** | 認証設定 | 認証方式セレクター + 設定フォーム |

```tsx
<Tabs defaultValue="params">
  <TabsList>
    <TabsTrigger value="params">
      Params {paramCount > 0 && <Badge variant="secondary">{paramCount}</Badge>}
    </TabsTrigger>
    <TabsTrigger value="headers">Headers</TabsTrigger>
    <TabsTrigger value="body">Body</TabsTrigger>
    <TabsTrigger value="auth">Auth</TabsTrigger>
  </TabsList>
  <TabsContent value="params">{/* Key-Value Editor */}</TabsContent>
  <TabsContent value="headers">{/* Key-Value Editor */}</TabsContent>
  <TabsContent value="body">{/* Body Editor */}</TabsContent>
  <TabsContent value="auth">{/* Auth Config */}</TabsContent>
</Tabs>
```

### 3.4 Key-Value エディタ（Headers / Params）

**使用コンポーネント**: shadcn `Table` + `Input` + `Checkbox`

ヘッダーやクエリパラメータの編集に使用する共通コンポーネント。

```
┌───┬─────────────────┬─────────────────┬─────────────────┬───┐
│ ✓ │ Key             │ Value           │ Description     │ ✕ │
├───┼─────────────────┼─────────────────┼─────────────────┼───┤
│ ✓ │ Content-Type    │ application/json│ Request format  │ ✕ │
│ ✓ │ Authorization   │ Bearer {{token}}│ Auth header     │ ✕ │
│ □ │ X-Debug         │ true            │ Debug mode      │ ✕ │
├───┼─────────────────┼─────────────────┼─────────────────┼───┤
│   │ Key             │ Value           │ Description     │   │ ← 空行（新規入力用）
└───┴─────────────────┴─────────────────┴─────────────────┴───┘
```

- 各行: チェックボックス（有効/無効切り替え） + Key 入力 + Value 入力 + Description 入力 + 削除ボタン
- 最下行は常に空行を表示し、入力すると自動的に新しい行が追加される
- 無効化された行は `opacity-50` で薄く表示
- `{{variable}}` 部分は `text-orange-400` でハイライト
- バルク編集モード（テキストエリアでの一括入力）も将来的に検討

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead className="w-8"></TableHead>
      <TableHead>Key</TableHead>
      <TableHead>Value</TableHead>
      <TableHead>Description</TableHead>
      <TableHead className="w-8"></TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {/* Rows */}
  </TableBody>
</Table>
```

### 3.5 ボディエディタ

**使用コンポーネント**: shadcn `Select` + `Textarea`（MVP）、将来的に Monaco Editor

Content-Type セレクター:
- `none` — ボディなし
- `JSON` — `application/json`
- `Form URL Encoded` — `application/x-www-form-urlencoded`（Key-Value エディタ）
- `Raw` — テキスト入力

MVP では `Textarea` に `font-mono text-sm` を適用した JSON エディタ。行番号表示は Phase 2 で Monaco Editor 導入時に対応。

### 3.6 レスポンスビューア

**使用コンポーネント**: shadcn `Tabs` + `Badge`

```
┌──────────────────────────────────────────────────┐
│ 200 OK  ·  245ms  ·  1.2 KB                     │
├──────────────────────────────────────────────────┤
│ [Body] [Headers (12)] [Cookies (3)]              │
├──────────────────────────────────────────────────┤
│ {                                                │
│   "users": [                                     │
│     {                                            │
│       "id": 1,                                   │
│       "name": "Alice"                            │
│     }                                            │
│   ]                                              │
│ }                                                │
└──────────────────────────────────────────────────┘
```

ヘッダー部:
- ステータスコード + ステータステキスト（色分けは 2.4 を参照）
- レスポンスタイム（`ms` 単位）
- レスポンスサイズ（自動で KB/MB 表示）
- 区切りは `·`（middle dot）で表示

タブ:
- **Body**: JSON の場合は pretty print（`font-mono text-sm`）、シンタックスハイライトは Phase 2
- **Headers**: レスポンスヘッダーを Key-Value テーブルで表示（読み取り専用）
- **Cookies**: Set-Cookie ヘッダーをパースして表示

```tsx
<div className="flex items-center gap-3 px-4 py-2 border-b">
  <span className={cn("font-mono font-bold text-lg", statusColorClass)}>
    {statusCode} {statusText}
  </span>
  <span className="text-muted-foreground text-sm">{responseTime}ms</span>
  <span className="text-muted-foreground text-sm">{responseSize}</span>
</div>
<Tabs defaultValue="body">
  <TabsList>
    <TabsTrigger value="body">Body</TabsTrigger>
    <TabsTrigger value="headers">
      Headers <Badge variant="secondary" className="ml-1">{headerCount}</Badge>
    </TabsTrigger>
    <TabsTrigger value="cookies">
      Cookies <Badge variant="secondary" className="ml-1">{cookieCount}</Badge>
    </TabsTrigger>
  </TabsList>
  {/* TabsContent */}
</Tabs>
```

### 3.7 Environment セレクター

**使用コンポーネント**: shadcn `Select` + `Dialog`

- ヘッダーバーに配置するドロップダウン
- 選択肢: 登録済み Environment 一覧 + "No Environment" + "Manage Environments..."
- "Manage Environments..." 選択時に `Dialog` を開く
- Dialog 内: Environment の作成 / 編集 / 削除、変数（Key-Value）の管理
- Secret 変数は値をマスク表示（`type="password"`）、表示トグルボタン付き

### 3.8 ダイアログ

**使用コンポーネント**: shadcn `Dialog`

以下の場面で使用:
- Environment 管理
- Collection のインポート
- リクエストの保存確認
- GitHub 認証フロー
- 設定画面

基本構成: `DialogHeader`（タイトル + 説明）+ `DialogContent`（フォーム）+ `DialogFooter`（Cancel + 確定ボタン）

### 3.9 トースト通知

**使用コンポーネント**: shadcn `Sonner`（`sonner` ライブラリのラッパー）

用途:
- リクエスト保存成功: `toast.success("Request saved")`
- ネットワークエラー: `toast.error("Connection refused")`
- Collection インポート完了: `toast.success("Imported 24 endpoints")`

表示位置: 画面右下（`position="bottom-right"`）

---

## 4. インタラクションパターン

### 4.1 キーボードショートカット

| ショートカット | アクション | スコープ |
|--------------|-----------|---------|
| `Cmd+Enter` | リクエスト送信 | リクエストエディタフォーカス時 |
| `Cmd+S` | リクエスト保存 | リクエストエディタフォーカス時 |
| `Cmd+N` | 新しいリクエスト作成 | グローバル |
| `Cmd+T` | 新しいタブを開く | グローバル |
| `Cmd+W` | アクティブタブを閉じる | グローバル |
| `Cmd+B` | サイドバー表示/非表示 | グローバル |
| `Cmd+,` | 設定を開く | グローバル |
| `Cmd+E` | Environment セレクターを開く | グローバル |
| `Cmd+L` | URL バーにフォーカス | グローバル |
| `Cmd+K` | コマンドパレット（Phase 2） | グローバル |

### 4.2 ローディング状態

**リクエスト送信中:**
- Send ボタンが `disabled` になり、テキストが "Sending..." に変わる
- Send ボタン内にスピナー（`Loader2` アイコン + `animate-spin`）を表示
- レスポンスビューアにはスケルトン表示（shadcn `Skeleton`）

```tsx
<Button disabled={isSending}>
  {isSending ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Sending...
    </>
  ) : (
    <>
      <Send className="mr-2 h-4 w-4" />
      Send
    </>
  )}
</Button>
```

**Collection 読み込み中:**
- サイドバーにスケルトンツリーを表示

**GitHub データ取得中:**
- 各セクションに個別のスケルトン / スピナーを表示

### 4.3 エラー状態

| エラー種別 | 表示方法 | コンポーネント |
|-----------|---------|--------------|
| ネットワークエラー（接続拒否、DNS 解決失敗） | レスポンスエリアにインラインエラーメッセージ + トースト | `Alert` (destructive) + `Sonner` |
| タイムアウト | レスポンスエリアにタイムアウトメッセージ | `Alert` (destructive) |
| URL 未入力 / 不正 | URL バーのバリデーション（赤枠） | `Input` + error state |
| GitHub 認証エラー | ダイアログ内にエラーメッセージ + リトライボタン | `Dialog` + `Alert` |
| OpenAPI パースエラー | ダイアログ内にエラー詳細表示 | `Dialog` + `Alert` |
| 保存失敗 | トースト通知 | `Sonner` |

レスポンスエリアのエラー表示例:

```
┌──────────────────────────────────────────────────┐
│                                                  │
│   ⚠ Could not send request                      │
│                                                  │
│   Error: Connection refused                      │
│   The server at localhost:3000 is not reachable.  │
│   Check if the server is running.                │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 4.4 空の状態（Empty States）

**Collection がない場合（サイドバー）:**

```
┌─────────────────┐
│                  │
│   📂             │
│   No collections │
│                  │
│   Import from    │
│   OpenAPI or     │
│   create a new   │
│   request.       │
│                  │
│   [Import]       │
│   [New Request]  │
└─────────────────┘
```

**レスポンスがまだない場合（レスポンスビューア）:**

```
┌──────────────────────────────────────────────────┐
│                                                  │
│              ↗ Enter a URL and                    │
│                click Send                        │
│                                                  │
│              or press Cmd+Enter                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

テキストは `text-muted-foreground` で控えめに表示。アイコンは `text-muted-foreground/50` でさらに薄く。

---

## 5. アイコン

Lucide Icons を使用する（shadcn/ui にバンドル済み）。

### 主要アイコン一覧

| 用途 | アイコン名 | import |
|------|-----------|--------|
| リクエスト送信 | `Send` | `lucide-react` |
| 新規作成 | `Plus` | `lucide-react` |
| 削除 | `Trash2` | `lucide-react` |
| 保存 | `Save` | `lucide-react` |
| 設定 | `Settings` | `lucide-react` |
| 検索 | `Search` | `lucide-react` |
| フォルダ（開） | `FolderOpen` | `lucide-react` |
| フォルダ（閉） | `Folder` | `lucide-react` |
| コピー | `Copy` | `lucide-react` |
| 複製 | `CopyPlus` | `lucide-react` |
| 閉じる | `X` | `lucide-react` |
| 展開 | `ChevronRight` | `lucide-react` |
| 折りたたみ | `ChevronDown` | `lucide-react` |
| ローディング | `Loader2` | `lucide-react` |
| エラー / 警告 | `AlertTriangle` | `lucide-react` |
| 成功 | `CheckCircle` | `lucide-react` |
| GitHub | `Github` | `lucide-react` |
| 環境 | `Globe` | `lucide-react` |
| 鍵 / Secret | `Eye` / `EyeOff` | `lucide-react` |
| ログアウト | `LogOut` | `lucide-react` |
| ダウンロード | `Download` | `lucide-react` |
| ドキュメント | `FileText` | `lucide-react` |
| リンク | `ExternalLink` | `lucide-react` |

アイコンサイズの基準:
- ボタン内アイコン: `h-4 w-4`
- ツリーアイテムのアイコン: `h-4 w-4`
- 空の状態の大きなアイコン: `h-12 w-12`
- ヘッダーのアクションアイコン: `h-5 w-5`

---

## 6. タイポグラフィ

### フォント設定

| 用途 | フォントファミリー | Tailwind クラス |
|------|------------------|----------------|
| UI ラベル、説明文、ボタンテキスト | システム Sans-serif | `font-sans`（デフォルト） |
| URL、ヘッダー値、JSON ボディ、ステータスコード | Monospace | `font-mono` |
| API パス（Collection ツリー内） | Monospace | `font-mono` |
| Environment 変数名 / 値 | Monospace | `font-mono` |

### フォントサイズ

| 要素 | サイズ | Tailwind クラス |
|------|-------|----------------|
| ヘッダーバーのアプリ名 | 18px | `text-lg font-semibold` |
| タブのラベル | 14px | `text-sm` |
| URL 入力 | 14px | `text-sm font-mono` |
| Key-Value エディタ | 13px | `text-[13px] font-mono` |
| JSON ボディ（リクエスト/レスポンス） | 13px | `text-[13px] font-mono` |
| ステータスコード | 18px | `text-lg font-mono font-bold` |
| レスポンスメタ情報（時間、サイズ） | 12px | `text-xs text-muted-foreground` |
| Collection ツリーのアイテム | 13px | `text-[13px]` |
| Empty state のメッセージ | 14px | `text-sm text-muted-foreground` |

### 行間・余白の基準

- コンポーネント間の余白: `gap-2`（8px）または `gap-4`（16px）
- セクション間の余白: `space-y-4`（16px）
- パディング（カード内など）: `p-4`（16px）
- テーブルセルのパディング: `px-3 py-2`

---

## 7. 主要画面の構成詳細

### 7.1 初回起動画面

GitHub 未ログインかつ Collection がない初回起動時:

```
┌──────────────────────────────────────────────────────────┐
│  [🐱 Meow]  [No Environment ▼]            [Sign in]  [⚙]│
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│  Empty   │           🐱 Welcome to Meow                  │
│  sidebar │                                               │
│          │   Get started by signing in with GitHub        │
│  [Import]│   to import your API specs,                   │
│  [New]   │   or create a new request manually.           │
│          │                                               │
│          │   [Sign in with GitHub]  [New Request]         │
│          │                                               │
├──────────┴───────────────────────────────────────────────┤
└──────────────────────────────────────────────────────────┘
```

### 7.2 リクエスト実行画面（メイン画面）

上記レイアウト設計（セクション 1）の通り。リクエスト実行後の状態:

- 左ペイン: Collection ツリーで選択中のリクエストがハイライト
- 中央ペイン: URL バー + リクエストエディタ（Params/Headers/Body/Auth タブ）
- 右ペイン: レスポンス（ステータスバー + Body/Headers/Cookies タブ）

---

## 8. 実装上の注意点

### 8.1 shadcn/ui コンポーネントの追加

必要なコンポーネントは以下のコマンドで追加する:

```bash
# 必須コンポーネント（Milestone 2 で必要）
pnpm dlx shadcn@latest add sidebar
pnpm dlx shadcn@latest add tabs
pnpm dlx shadcn@latest add table
pnpm dlx shadcn@latest add input
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add select
pnpm dlx shadcn@latest add badge
pnpm dlx shadcn@latest add resizable
pnpm dlx shadcn@latest add skeleton
pnpm dlx shadcn@latest add sonner
pnpm dlx shadcn@latest add collapsible
pnpm dlx shadcn@latest add checkbox
pnpm dlx shadcn@latest add textarea
pnpm dlx shadcn@latest add alert

# Milestone 3 以降で追加
pnpm dlx shadcn@latest add dialog
pnpm dlx shadcn@latest add context-menu
pnpm dlx shadcn@latest add tooltip
pnpm dlx shadcn@latest add dropdown-menu
pnpm dlx shadcn@latest add separator
pnpm dlx shadcn@latest add scroll-area
pnpm dlx shadcn@latest add avatar
```

### 8.2 Tailwind CSS v4 での注意

- Tailwind CSS v4 では `tailwind.config.js` ではなく CSS ファイル内の `@theme` ディレクティブでカスタマイズする
- shadcn/ui は OKLCH カラーを CSS 変数として定義する
- `dark` クラスによるテーマ切り替え

### 8.3 アクセシビリティ

- すべてのインタラクティブ要素にキーボードでアクセス可能にする
- shadcn/ui は Radix UI ベースのため、基本的な ARIA 属性は自動的に付与される
- アイコンのみのボタンには `aria-label` を付与する
- フォーカスリングは shadcn/ui デフォルトの `ring` スタイルを使用
