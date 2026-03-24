# 基本設計書（現行実装準拠）

- 最終更新日: 2026-03-24
- 対象: `ai-nippo`（Next.js App Router + TypeScript）
- ソースオブトゥルース: 現在の実装コード / 設定 / SQL（旧ドキュメントより優先）

---

## 1. システム目的とスコープ

本システムは、現場での打刻（IN/OUT）を中心に、勤怠・工数レポートと在庫管理を提供する業務Webアプリである。

主要ユースケース:
- ユーザー認証（Credentials）
- NFC打刻（位置情報付き）
- 月次/日次レポート閲覧、Excel出力
- 管理者向けマスタ管理（現場/ユーザー/作業区分）
- 在庫管理（品目、保管場所、持ち出し、画像アップロード）

---

## 2. アーキテクチャ概要

- フレームワーク: Next.js 15（App Router）
- 実行基盤: GitHub → Vercel（`vercel.json` で build/cron 設定）
- API 実装: `app/api/**/route.ts`
- 認証: NextAuth Credentials（JWT セッション）
- DB: Neon Postgres（`DATABASE_URL` または `NEON_DATABASE_URL`）
- ランタイム: API は原則 `runtime = 'nodejs'`

設計上の原則:
- DBアクセスはサーバー側に限定（`server-only` / Route Handler / Server Component）
- 機密値は環境変数で管理し、クライアント公開は `NEXT_PUBLIC_*` に限定
- SQL はパラメータ化（`$1` 形式、または Neon の template tag）

---

## 3. モジュール責務

### 3.1 画面層
- `app/(auth)/login`: ログイン画面
- `app/(protected)/nfc`: 打刻画面
- `app/(protected)/dashboard`: カレンダー/ダッシュボード
- `app/reports`, `app/reports/attendance`, `app/(protected)/reports/sites`: レポート
- `app/(protected)/inventory/**`: 在庫管理 UI

### 3.2 API 層
- 認証: `app/api/auth/[...nextauth]/route.ts`
- 打刻: `app/api/stamp/route.ts`
- マスタ参照（互換系）: `app/api/masters/*`
- マスタ管理（管理者）: `app/api/master/*`
- レポート: `app/api/reports*`, `app/api/report/work/attendance*`, `app/api/calendar/*`
- 在庫: `app/api/inventory/*`
- 運用: `app/api/health*`, `app/api/cron/close-open-sessions`

### 3.3 共通ライブラリ
- 認証設定: `lib/auth.ts`
- DB接続: `lib/db.ts`, `lib/db/neon.ts`, `lib/server-env.ts`
- セッション補正: `lib/services/sessions.ts`
- 打刻の最近傍拠点判定: `lib/stamp/gpsNearest.ts`
- 入力検証（Zod）: `lib/master/schemas.ts`, `lib/inventory/schemas.ts`

---

## 4. 認証・認可モデル

- 認証方式は NextAuth Credentials。
- `middleware.ts` で `/reports`, `/dashboard`, `/report`, `/inventory` を保護。
- 追加でページ/API 側でも `auth()` を実施（多層ガード）。
- 管理者専用 API は `getAdminSession()` で `role === 'admin'` を必須化。

注意点:
- `/masters/*` は認証済みユーザー向け参照 API（旧互換形式）。
- `/master/*` は管理者向け CRUD API。

---

## 5. データ設計（現行）

### 5.1 主要テーブル（public）
- `users`
- `machines`
- `sites`
- `work_types`
- `logs`
- `sessions`

### 5.2 在庫スキーマ
- `inventory.locations`
- `inventory.items`

### 5.3 打刻〜セッション連動
1. `/api/stamp` で `logs` へ INSERT
2. `handleSessionAfterLogInsert` が非同期で実行され、IN で open session 作成 / OUT で close
3. cron で open session を強制クローズ可能

### 5.4 位置情報判定
- `sites.center_geog` を使って `ST_Distance` 最短拠点を選定
- `radius_m` は受理可否ではなく `withinRadius` 判定補助
- `center_geog` 未整備時は active site の fallback 選択

---

## 6. APIサーフェス（主要）

- Auth: `GET|POST /api/auth/[...nextauth]`
- Stamp: `POST /api/stamp`
- Health: `GET /api/health`, `GET /api/health/db`
- Cron: `GET /api/cron/close-open-sessions`（`CRON_SECRET` 必須）
- Reports: `/api/reports`, `/api/reports/search`, `/api/reports/work`, `/api/reports/export/excel`
- Attendance: `/api/report/work/attendance`, `/api/report/work/attendance/day`, `/api/report/work/attendance/export/excel`
- Sites report: `/api/reports/sites`, `/api/reports/sites/export/excel`
- Calendar: `/api/calendar/month`, `/api/calendar/day`
- Master CRUD（admin）: `/api/master/sites|users|work-types` (+ `[id]`)
- Master read（auth）: `/api/masters/sites|machines|work-types`
- Inventory: `/api/inventory/items`, `/api/inventory/items/[id]`, `/api/inventory/items/[id]/carry-out`, `/api/inventory/locations`, `/api/inventory/categories`, `/api/inventory/upload`

---

## 7. 環境変数・公開境界

### 7.1 サーバー専用
- `DATABASE_URL` / `NEON_DATABASE_URL`
- `AUTH_SECRET` / `NEXTAUTH_SECRET`
- `CRON_SECRET`
- `BLOB_READ_WRITE_TOKEN`
- `FORCED_OUT_JST_TIME`
- `DEBUG_TOKEN`（debug API）
- `ENABLE_BREAK_POLICY`, `TIME_CALC_*`
- `SEED_ADMIN_*`（seedスクリプト）

### 7.2 クライアント公開
- `NEXT_PUBLIC_DEFAULT_MACHINE_ID`

方針:
- DB 接続文字列・トークン類はクライアント露出禁止。
- ドキュメントにも実値を記載しない。

---

## 8. 外部連携

- Neon Postgres（主DB）
- Vercel Blob（在庫画像アップロード）
- Vercel Cron（`/api/cron/close-open-sessions` 呼び出し）

補足:
- コードベースに Airtable 由来の移行スクリプト/互換処理は残るが、現行運用の主系データアクセスは Neon。

---

## 9. 運用・非機能

- デプロイ: GitHub 連携で Vercel Preview/Production
- cron: `45 14 * * *`（UTC）で daily 強制退勤 API を実行
- 障害時:
  - DB未設定時は API が `DB env missing` を返却
  - 未認証時は 401
  - バリデーション不正は 400
- 監視補助:
  - `/api/health` `/api/health/db` で接続・必須テーブル/列を確認

---

## 10. 既知の設計判断

1. Node runtime を標準採用（DB/Excel/認証互換性重視）
2. 同一領域に新旧 API（`master` / `masters`）を共存させ段階移行を継続
3. 打刻直後の session 連動は非同期（`queueMicrotask`）で API 応答を優先
4. SQL はパラメータ化し、入力は Zod / 明示パースで検証

