# Master POST 500 調査メモ（users / sites / work-types）

## 調査対象
- `POST /api/master/users`
- `POST /api/master/sites`
- `POST /api/master/work-types`

## 結論サマリ
- **共通原因（最有力）**: 3つの POST 実装すべてで `*_code` カラム（`user_code` / `site_code` / `work_code`）を `INSERT` していない。
- UI 送信 payload と Zod スキーマにも `*Code` フィールドが存在せず、サーバー側にも SQL マッピングがないため、DB 実カラムが `NOT NULL` の場合は全エンドポイントで同時に 500 化する。
- 既存実装は catch で `DB_WRITE_FAILED` を返すため、DB 側の詳細エラーが UI では「保存に失敗しました。」に集約される。

## 根拠（共通）
- Users POST の `INSERT INTO public.users (...)` は `username,name,phone,email,password_hash,role,active,exclude_break_deduction` のみで `user_code` を含まない。
- Sites POST の `INSERT INTO public.sites (...)` は `name,client_name,center_geog,radius_m,priority,active` のみで `site_code` を含まない。
- Work-types POST の `INSERT INTO public.work_types (...)` は `name,sort_order,active,category` のみで `work_code` を含まない。
- 各 POST は DB 例外を握って 500 (`DB_WRITE_FAILED`) を返す。
- 各 UI フォーム payload にも `userCode/siteCode/workCode` が無く、API に送られていない。

## エンドポイント別の詳細

### 1) users
- `masterUserCreateSchema` に `userCode` が無い。
- POST SQL に `user_code` 列が無い。
- そのため `null value in column "user_code" ... violates not-null constraint` が最有力。
- `password_hash` は bcrypt で生成し INSERT しており、この点は 500 主因ではない。

### 2) sites
- `masterSiteCreateSchema` に `siteCode` が無い。
- POST SQL に `site_code` 列が無い。
- `center_geog` は `ST_SetSRID(ST_MakePoint($3,$4),4326)::geography` で生成しており、座標生成実装は存在する。
- したがって sites も最有力は `site_code` 未投入による NOT NULL 違反。

### 3) work-types
- `masterWorkTypeCreateSchema` に `workCode` が無い。
- POST SQL に `work_code` 列が無い。
- `category` は Zod enum (`operating|regular|other`) で制約済みのため、この点は主因ではない。
- 最有力は `work_code` 未投入による NOT NULL 違反。

## 想定される Vercel/PG 実エラー（推定）
- `null value in column "user_code" of relation "users" violates not-null constraint`
- `null value in column "site_code" of relation "sites" violates not-null constraint`
- `null value in column "work_code" of relation "work_types" violates not-null constraint`

## 追加観察（今回の 500 主因ではないが要注意）
- `masterIdSchema` が `uuid` 前提。id が UUID 以外の環境では `[id]/PATCH` は 400 になり得る（POST 500 とは別）。

## 最小修正方針（次プロンプト向け）
1. 各 create/update Zod に `userCode/siteCode/workCode` を追加。
2. UI フォームに各コード入力欄を追加し payload に含める。
3. 各 POST `INSERT` の列と VALUES に `*_code` を追加（必要なら unique 競合ハンドリング追加）。
4. 各 SELECT/RETURNING で `*_code AS "*Code"` を返し、`types/master.ts` を同期。
5. 可能なら DB エラーコード `23502`（NOT NULL）を識別し、`INVALID_BODY` 相当へ寄せて運用ログを明確化。

