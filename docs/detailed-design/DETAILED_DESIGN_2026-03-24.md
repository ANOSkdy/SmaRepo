# 詳細設計書（現行実装準拠）

- 作成日: 2026-03-24
- 対象リポジトリ: `ai-nippo`
- 前提: 現在のコード/設定/SQL を唯一の正とし、旧 docs との差分はコード優先で解釈する

---

## 1. 認証・セッション

### 目的
- 社内利用者の認証と、ロール情報（admin/user）をセッションに保持する。

### 関連ファイル
- `lib/auth.ts`
- `middleware.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `lib/master/auth.ts`

### Screen / Route
- 画面: `/login`
- API: `/api/auth/[...nextauth]`

### API I/O
- Credentials で `username` / `password` を受け取り認証。
- 認証成功時、JWT に `id`, `role`, `userId` を格納し session に転写。

### Validation
- username/password の trim + 空文字拒否。
- login identifier は lowercase 正規化。

### DB Read/Write
- `users` から認証候補を1件取得（username/email/userId のいずれか一致）。
- 書き込みなし。

### Auth / Permission
- middleware で主要ページ群を保護。
- 管理者 API は `getAdminSession()` で role チェック。

### Error handling
- 認証失敗は理由コードを内部ログ化し、外部には失敗のみ返す。
- DB 例外時はメッセージを sanitize。

### State transitions / Rules
- 未ログイン → `/login`
- ログイン済み → 保護ページアクセス可
- role != admin → `/api/master/*` は 403

### Test points / Known gaps
- `users` テーブル列名揺れに対する吸収ロジックが多く、将来のスキーマ固定時に簡略化余地あり。

---

## 2. 打刻（NFC）

### 目的
- IN/OUT 打刻を記録し、拠点判定情報を `logs` に永続化する。

### 関連ファイル
- `app/(protected)/nfc/page.tsx`
- `components/StampCard.tsx`
- `app/api/stamp/route.ts`
- `lib/stamp/gpsNearest.ts`
- `lib/services/sessions.ts`

### Screen / Route
- 画面: `/nfc`
- API: `POST /api/stamp`

### API I/O
- Input（代表）: `type|stampType`, `machineId`, `workDescription`, `lat/lon`, `accuracy`, `stampedAt`
- Output: `{ ok, stamp, requestId }`

### Validation
- `zod` で揺れ吸収付きバリデーション。
- `type IN|OUT` 必須、machineId 必須。

### DB Read/Write
- Read:
  - user 解決 (`users`)
  - machine 解決 (`machines`)
  - nearest site 解決 (`sites.center_geog`)
- Write:
  - `logs` へ INSERT
- Side effect:
  - 挿入後 `handleSessionAfterLogInsert(logId)` を非同期起動

### Auth / Permission
- `auth()` 必須（未認証は 401）。

### Error handling
- 不正 payload: 400（issues 返却）
- machine 解決不可: 400
- 例外: 500 + requestId

### State transitions / Rules
- 打刻は常に logs を一次記録。
- position 情報がある場合は最寄り現場を決定。
- `radius_m` は受理拒否条件ではなく `withinRadius` 補助フラグ。

### Test points / Known gaps
- machine 解決が列存在検査ベースのため、スキーマ標準化後に単純化可能。

---

## 3. セッション保守（logs → sessions）

### 目的
- IN/OUT ログから `sessions` を整合的に維持し、レポート基盤を安定化する。

### 関連ファイル
- `lib/services/sessions.ts`
- `app/api/cron/close-open-sessions/route.ts`
- `vercel.json`

### Screen / Route
- API: `GET /api/cron/close-open-sessions`

### API I/O
- Query: `date`, `dryRun`
- Header: `x-cron-secret` または `Authorization: Bearer ...`
- Response: `{ ok, dateJst, closedCount, dryRun }`

### Validation
- secret 照合必須。
- `workDate` 未指定時は JST 現在日。

### DB Read/Write
- `sessions` open/close 更新
- 手動/cron とも同一サービスを使用

### Auth / Permission
- cron API は NextAuth ではなく shared secret 認証。

### Error handling
- secret 不一致: 401
- DB未設定: 500
- 例外: 500

### State transitions / Rules
- IN: open session を作成（既存 open があれば作らない）
- OUT: 最新 open session を close
- cron: 対象日 open session を強制 close

### Test points / Known gaps
- OUT 先行など異常順序は warn ログでスキップ。

---

## 4. レポート（個別・現場・勤怠）

### 目的
- logs/sessions を基に月次・日次の実績を照会し、Excel 出力を提供する。

### 関連ファイル
- `app/reports/page.tsx`
- `app/api/reports/route.ts`
- `app/api/reports/search/route.ts`
- `app/api/reports/work/route.ts`
- `app/api/reports/export/excel/route.ts`
- `app/api/reports/sites/route.ts`
- `app/api/reports/sites/export/excel/route.ts`
- `app/api/report/work/attendance/route.ts`
- `app/api/report/work/attendance/day/route.ts`
- `app/api/report/work/attendance/export/excel/route.ts`

### Screen / Route
- 画面: `/reports`, `/reports/attendance`, `/reports/sites`
- API: 上記 `app/api/reports*` / `app/api/report/work/attendance*`

### API I/O
- year/month/user/site 等を query で受け取り JSON または Excel を返却。

### Validation
- 年月フォーマット、必須パラメータ、範囲（month 1..12）を検証。

### DB Read/Write
- 主に読み取り（logs, sessions, users, sites, machines）
- 書き込みなし

### Auth / Permission
- 基本 `auth()` 必須。

### Error handling
- 必須不足/形式不正: 400
- 未認証: 401
- DB異常: 500

### State transitions / Rules
- 集計対象は logs 中心、必要に応じ sessions を参照。
- Excel は server-side 生成（node runtime）。

### Test points / Known gaps
- 大量データ時の応答時間と Excel 生成時間は運用監視対象。

---

## 5. マスタ管理

### 目的
- 現場・ユーザー・作業区分の CRUD を管理者に提供する。

### 関連ファイル
- `app/(protected)/dashboard/master/**`
- `app/api/master/sites*`
- `app/api/master/users*`
- `app/api/master/work-types*`
- `lib/master/schemas.ts`

### Screen / Route
- 画面: `/dashboard/master/*`
- API: `/api/master/sites|users|work-types` (+ `/:id`)

### API I/O
- GET 一覧 / POST 作成 / PATCH 更新（一部 DELETE なし）

### Validation
- Zod で UUID・必須文字列・数値範囲・enum を検証。

### DB Read/Write
- `sites`, `users`, `work_types` に対して CRUD。
- users 作成時は password hash を扱う。

### Auth / Permission
- `getAdminSession()` による admin 必須。

### Error handling
- UNAUTHORIZED 401 / FORBIDDEN 403 / INVALID_BODY 400 / DB_* 500

### State transitions / Rules
- 命名は API DTO（camelCase）と DB 列（snake_case）を明示マッピング。

### Test points / Known gaps
- 旧互換 API（`/api/masters/*`）との二重経路があるため、UI からの使用先を継続確認する。

---

## 6. 在庫管理

### 目的
- 在庫品目の照会・登録・更新・持ち出し・画像添付を提供する。

### 関連ファイル
- `app/(protected)/inventory/**`
- `app/api/inventory/items*`
- `app/api/inventory/locations*`
- `app/api/inventory/categories/route.ts`
- `app/api/inventory/upload/route.ts`
- `lib/inventory/schemas.ts`
- `lib/inventory/db.ts`

### Screen / Route
- 画面: `/inventory`, `/inventory/new`, `/inventory/[id]`, `/inventory/locations`
- API: `/api/inventory/*`

### API I/O
- items CRUD + carry-out
- locations CRUD
- categories 参照
- upload は multipart file

### Validation
- Zod で SKU/name/uuid/数量/状態を検証。
- upload は MIME とサイズ上限（5MB）を検証。

### DB Read/Write
- `inventory.items`, `inventory.locations` を read/write。
- `category_id` は machine code text を利用。

### Auth / Permission
- 認証必須（admin 専用ではない）。

### Error handling
- 不正JSON/不正ID/不正BODYは 400。
- 未認証 401。
- DB・Blob 外部失敗は 5xx。

### State transitions / Rules
- carry-out は在庫を減算（最小 0 以上を維持）。
- 画像アップロード先は Vercel Blob。

### Test points / Known gaps
- Blob token 未設定環境では upload API が 500 になるため、環境差異の事前確認が必要。

---

## 7. ヘルスチェック・運用

### 目的
- 稼働確認、依存DBのスキーマ充足確認、障害切り分けを容易化する。

### 関連ファイル
- `app/api/health/route.ts`
- `app/api/health/db/route.ts`
- `lib/health.ts`

### Screen / Route
- API: `/api/health`, `/api/health/db`

### API I/O
- 稼働可否、DB接続、必須テーブル/列の存在、timestamp、commit SHA を返却。

### Validation
- auth 必須。

### DB Read/Write
- Read のみ（`SELECT 1`, `information_schema`, `to_regclass`）。

### Auth / Permission
- ログイン済みユーザーのみ。

### Error handling
- 未認証 401
- DB 未接続/不足 500

### Test points / Known gaps
- 要件変更時は REQUIRED_TABLES/REQUIRED_COLUMNS のメンテナンスが必要。

