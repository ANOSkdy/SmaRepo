# 1. Scope

- 対象事象: 「退勤漏れ後に夜間自動クローズされるはずの `sessions` が翌日も `open` のまま残存」。
- 調査対象: 実装有無、配線（デプロイ設定）、実行条件（secret/date/work_date/JST）、データ選択条件。
- 制約: 本リポジトリ内とローカル実行で確認可能な範囲までを **confirmed**、Vercel本番設定/本番DB実データはアクセス手段がないため **inferred** として分離する。

# 2. Relevant Files / Config

- `lib/services/sessions.ts`
- `app/api/cron/close-open-sessions/route.ts`
- `app/api/stamp/route.ts`
- `lib/services/nfcAttendanceState.ts`
- `app/(protected)/nfc/page.tsx`
- `tests/lib/services/sessions.test.ts`
- `tests/lib/services/nfcAttendanceState.test.ts`
- `vercel.json`

# 3. Confirmed Implementation Status

## 3.1 セッション自動クローズ実装（confirmed）

- `forceCloseOpenSessionsByWorkDate(workDate, forcedEndAtJstTime)` が実装済み。
- SQL は `sessions` テーブルの `work_date = $2` かつ `status = 'open'` を対象に、以下を更新する:
  - `end_at = <workDate> <forcedTime> +09`
  - `duration_min = GREATEST(floor((end_at - start_at)/60), 0)`
  - `status = 'closed'`
  - `auto_generated = true`
  - `updated_at = now()`
- `logs` への擬似OUT挿入は行わない（sessions-onlyクローズ）。

抜粋:

```ts
WHERE work_date = $2::date
  AND status = 'open'
```

## 3.2 cron API 実装（confirmed）

- `GET /api/cron/close-open-sessions` は存在。
- secret ガードは以下両方に対応:
  - `x-cron-secret`
  - `Authorization: Bearer <CRON_SECRET>`
- `CRON_SECRET` 未設定または不一致時は `401 UNAUTHORIZED`。
- 対象日付は `?date=YYYY-MM-DD` がなければ `toYmdJst()` の当日JST。
- `FORCED_OUT_JST_TIME` 未設定時は `'17:30'`。

## 3.3 セッション生成/更新配線（confirmed）

- 打刻API（`/api/stamp`）で `logs` INSERT 後、`queueMicrotask` で `handleSessionAfterLogInsert(insertedLogId)` を呼び出し。
- これにより IN で open session 作成、OUT で open session クローズする実装は配線済み。

## 3.4 `/nfc` の翌日リセット挙動（confirmed）

- `/nfc` は `createNfcAttendanceStateService().getCurrentStateForUser()` を使用。
- 同サービスは **JST当日 (`getJstWorkDate`) の `sessions` のみ** 参照して `isWorking`/`stampType` を決定。
- そのため、前日の open が残っていても当日 `work_date` に open がなければ IN 初期状態に戻る設計。

# 4. Expected Nightly Flow

1. Vercel Cron（または同等サーバー実行）が毎日定時に `GET /api/cron/close-open-sessions` を呼ぶ。
2. リクエストは `CRON_SECRET` を `x-cron-secret` または `Authorization: Bearer` で付与。
3. ルートは `date` 未指定なら実行時JST日付を対象に `forceCloseOpenSessionsByWorkDate` 実行。
4. 対象 `sessions(work_date = targetDate, status='open')` が `closed` 化される。
5. 翌日 `/nfc` は当日 `work_date` の state でIN開始可能。

# 5. Findings

## 5.1 confirmed

1. 実装は存在し、主要配線も存在。
2. `vercel.json` に `crons` 設定が存在しない。
3. リポジトリ内に他の cron スケジュール定義ソース（例: `crons` フィールド、別デプロイ設定）は見当たらない。
4. route の secret 検証は厳格で、ヘッダ不一致なら必ず401。
5. クローズ対象条件は `work_date` 完全一致 + `status='open'` のため、日付ズレ/状態不整合で容易に取りこぼす。

## 5.2 inferred（本番アクセス不可のため未確証）

- 本番で cron が未設定（Dashboard 側未登録）だと、エンドポイントが一度も叩かれず open 残存は自然に発生。
- cron が存在しても `CRON_SECRET` 不一致なら 401 でクローズ0件。
- cron 実行時刻が想定JST日付境界とズレると、`toYmdJst()` により対象 `work_date` を誤る可能性。
- 対象セッションが `work_date` 異常値（例: UTC基準で前日/翌日）や `status!='open'` ならSQL更新対象外。

# 6. Root Cause

## 最小根本原因（現時点で最も強い証拠）

**実装はあるが、cron スケジュールのIaC配線がリポジトリに存在しないため、運用依存（Vercel Dashboard手動設定）になっていること。**

- これにより「環境差分」「設定漏れ」「設定消失」が起きても Git 管理で検知できず、未実行のまま open が残るリスクが高い。
- 事象「昨日 open が残った」との整合性が最も高い。

> 注: 本番 Dashboard / Logs 未確認のため “確定” ではなく、**最有力**。

# 7. Most Likely Alternatives

1. **cron は実行されたが `CRON_SECRET` 不一致で401**
   - 兆候: Vercel Function Logs に 401 応答、`closedCount` なし。
2. **cron 実行時刻/日付解釈ずれ**
   - 兆候: 実行時の `dateJst` が期待日と不一致（UTC基準スケジュール設定ミス等）。
3. **データ条件ミスマッチ**
   - 兆候: 対象 row の `work_date` が想定日でない、`status` が `open` でない、対象 row 自体なし。
4. **実行は成功したが別UIが別ソースを見ている**
   - 現コード上 `/nfc` は `sessions` 参照なので優先度低。レポート系との見え方差分はあり得る。

# 8. Minimal Fix Plan

1. **cron 設定を IaC 化（最小）**
   - `vercel.json` に `crons` を追加し、`/api/cron/close-open-sessions` を毎日 14:45 UTC（= 23:45 JST）で実行。
   - 例: `{ "path": "/api/cron/close-open-sessions", "schedule": "45 14 * * *" }`
2. **Vercel Env を明示固定**
   - `CRON_SECRET` を Production/Preview で設定し、値一致を運用Runbook化。
   - 任意: `FORCED_OUT_JST_TIME=17:30` も明示設定。
3. **最小観測性追加**
   - route で secret自体は出さず、`dateJst`, `closedCount`, `dryRun`, status code を構造化ログ出力。
4. **スポット検証SQL（Runbook化）**
   - 事象日の `sessions`/`logs` を user/date で確認し、`work_date` と `status` の取りこぼし有無を即断できるようにする。

# 9. Validation Steps

## 9.1 リポジトリで確認したコマンド（confirmed）

- `sed -n '1,200p' vercel.json`
- `nl -ba app/api/cron/close-open-sessions/route.ts | sed -n '1,240p'`
- `nl -ba lib/services/sessions.ts | sed -n '1,420p'`
- `nl -ba app/api/stamp/route.ts | sed -n '355,405p'`
- `nl -ba lib/services/nfcAttendanceState.ts | sed -n '1,220p'`
- `nl -ba app/(protected)/nfc/page.tsx | sed -n '113,138p'`
- `pnpm exec node --import tsx --test tests/lib/services/sessions.test.ts tests/lib/services/nfcAttendanceState.test.ts`
- `pnpm build`

## 9.2 本番で直ちに実施すべき確認（inferred）

1. **Vercel Cron 登録有無**
   - `/api/cron/close-open-sessions` が daily で登録されているか。
2. **実行ログ確認（事象日の 23:45 JST 前後）**
   - request 到達有無、HTTP 200/401/500、レスポンス `dateJst` / `closedCount`。
3. **Secret一致確認**
   - Vercel Env `CRON_SECRET` と送信ヘッダが一致しているか。
4. **DB実データ確認（read-only）**
   - `sessions` 対象row: `work_date`, `status`, `start_at`, `end_at`, `auto_generated`, `updated_at`
   - `logs` 対象row: IN/OUT の有無と `work_date` 整合。

推奨SQL:

```sql
-- 1) target sessions
SELECT id, user_id, work_date, start_at, end_at, duration_min, status, auto_generated, updated_at
FROM sessions
WHERE user_id = $1
  AND work_date IN ($2::date, $3::date)
ORDER BY work_date DESC, start_at DESC;

-- 2) target logs
SELECT id, user_id, stamp_type, work_date, stamped_at, auto_generated, machine_id, work_description
FROM logs
WHERE user_id = $1
  AND work_date IN ($2::date, $3::date)
ORDER BY stamped_at DESC;

-- 3) count open sessions by date
SELECT work_date, status, COUNT(*)
FROM sessions
WHERE user_id = $1
  AND work_date BETWEEN $2::date AND $3::date
GROUP BY work_date, status
ORDER BY work_date DESC, status;
```
