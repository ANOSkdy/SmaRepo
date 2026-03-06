# Repo A → Repo B Parity Plan

## 1. Executive Summary

- Repo B はログイン / 打刻 / カレンダー / 各種レポート / Excel 出力 / 強制 OUT cron まで実装済みで、Repo A の主要ユースケースは既に概ねカバー済み。
- 残タスクは「機能移植」よりも、**Repo B の整合化（DB クライアント統一・互換 SQL 縮退・認可統一）**と、既存機能の**同等性検証**が中心。
- 方針は Repo B を将来系の正とし、Neon/Postgres + server-only env を維持。Airtable 前提実装・認可漏れ・式依存ロジックは直接移植しない。

## 2. What Already Matches Between Repo A and Repo B

- 認証: NextAuth(Credentials) ベースのログイン動線が存在。
- 打刻: NFC 打刻 UI/API、IN/OUT イベント処理、強制 OUT cron が存在。
- 可視化: 月/日カレンダー API とダッシュボード表示が存在。
- レポート: 個人レポート、現場別レポート、勤怠集計 API、Excel/印刷系エンドポイントが存在。
- 位置関連: 位置判定・エラー型のユーティリティが存在（将来の判定強化を受け止める土台あり）。

## 3. Repo A → Repo B Feature Gap Matrix

| Feature / Flow | Repo A status | Repo B status | Gap summary | Dependency type | Migration classification | Suggested Repo B files/modules to touch | Priority |
|---|---|---|---|---|---|---|---|
| Credentials ログイン | 実装済み | 実装済み | 大きな機能差分なし。監査観点は認証後の API ガード一貫性。 | auth / test | portable | `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `middleware.ts` | P0 |
| NFC 打刻 (IN/OUT) | 実装済み | 実装済み | API は動作済みだが DB クライアントが `pg` と `neon` で二重化。 | API / service / DB / test | requires DB adaptation | `app/api/stamp/route.ts`, `lib/db.ts`, `lib/db/neon.ts` | P0 |
| 月/日カレンダー | 実装済み | 実装済み | JST 境界・未完了セッション表示の回帰検証を追加すべき。 | API / service / test | portable | `app/api/calendar/month/route.ts`, `app/api/calendar/day/route.ts`, `lib/jstDate.ts`, `lib/calendar/neon.ts` | P1 |
| 個人レポート | 実装済み | 実装済み | IN/OUT ペアリングの同等性確認（open IN, OUT先行耐性）を明文化。 | service / API / export / test | portable | `lib/services/reports.ts`, `app/reports/_utils/reportData.ts`, `app/api/reports/route.ts` | P1 |
| 勤怠集計（日次/月次） | 実装済み | 実装済み | 休憩控除ルール優先度の検証ケースを拡充。 | service / API / test | portable | `lib/report/work/attendance/*`, `app/api/report/work/attendance/*` | P1 |
| 現場別レポート | 実装済み | 実装済み | `to_jsonb/COALESCE` 依存を段階的に縮退し、列名揺れ互換を出口管理。 | service / DB / export / test | requires DB adaptation | `lib/reports/siteReport.ts`, `app/api/reports/sites/route.ts`, `app/api/reports/sites/export/excel/route.ts` | P0 |
| Excel 出力 | 実装済み | 実装済み | 既存出力はあるため、A と同等フォーマット要件の差分確認が主。 | export / test | portable | `app/api/reports/export/excel/route.ts`, `app/api/report/work/attendance/export/excel/route.ts` | P2 |
| 強制 OUT cron | 実装済み | 実装済み | cron シークレット検証は実装済み。運用は dry-run を含む回帰手順を固定化。 | cron / DB / test | portable | `app/api/cron/close-open-sessions/route.ts` | P1 |
| マスタ参照 API（sites/machines/work-types） | A 側は実装依存あり | 実装済み（公開 GET） | 認可未設定の可能性。`session`/`role` ベースのガード追加が必要。 | API / auth / test | requires DB adaptation | `app/api/masters/sites/route.ts`, `app/api/masters/machines/route.ts`, `app/api/masters/work-types/route.ts`, `lib/permissions.ts` | P0 |
| Airtable `filterByFormula` 依存検索 | 強依存 | B は Neon SQL ベース | Airtable 式をそのまま持ち込むと保守不能。SQL 条件に再定義。 | DB / service | do not port directly | `lib/services/*`, `lib/report/*`, `scripts/migrate/*` | P0 |
| Airtable レコード ID / link array 前提 | 強依存 | B は UUID/正規化テーブル | 参照モデルが別物。変換層を介した概念移植のみ許可。 | DB / service | do not port directly | `migrations/*.sql`, `lib/db.ts`, `types/*` | P0 |
| 無認証レポート API パターン | A に監査警告 | B は主要レポートで認証済み | B で未ガード API をゼロにする。A の欠陥は移植禁止。 | auth / API / test | do not port directly | `app/api/**/route.ts`, `middleware.ts` | P0 |

## 4. Portable Logic to Reuse Conceptually

- IN/OUT スタック・ペアリング戦略（不整合データ耐性を含む）。
- 日次/月次勤怠の集計手順（分単位集約、超過計算、未完了セッション取り扱い）。
- 休憩控除ポリシーの優先順（個人設定 > 既定設定など）を Repo B のポリシーモジュールに寄せて維持。
- 位置判定フロー（polygon 優先→近傍補完）と JST 日付境界の扱い。
- ロール別ナビゲーション制御の考え方（実装は Repo B の `permissions`/UI 構成に合わせる）。

## 5. DB Adaptation Required in Repo B

- `pg` クライアント (`lib/db.ts`) と `neon` クライアント (`lib/db/neon.ts`) の二重運用を縮退し、打刻 API を含めて接続方針を一本化。
- `to_jsonb(...)` + `COALESCE(...)` による列名揺れ吸収を「移行期間の互換層」と明示し、段階的に正規列へ寄せる。
- Logs/Sessions の旧新フィールド混在（`type`/`stamp_type`, `date`/`work_date` 等）は、正規化関数を共通化して出口を限定。
- マイグレーションと backfill で、互換層削減の前提データ品質を担保。

## 6. Direct-Port-Prohibited Areas

- Airtable `filterByFormula`・lookup 名称揺れ・リンク配列前提ロジック。
- Airtable REST cron ペイロード前提の差分生成。
- 平文パスワード比較など、認証/認可の脆弱実装。
- 無認証レポート API パターン。
- Logs/Sessions を曖昧に横断する「どちらか正しければよい」判定。

## 7. Safe Extension Points in Repo B

- 個人レポート集計: `lib/services/reports.ts`, `app/reports/_utils/reportData.ts`
- 現場レポート: `lib/reports/siteReport.ts`, `app/api/reports/sites/route.ts`
- 勤怠ドメイン: `lib/report/work/attendance/*`, `app/api/report/work/attendance/*`
- DB 進化: `migrations/*.sql`, `scripts/migrate/*`, `scripts/backfill/*`
- セキュリティ制御: `lib/permissions.ts`, `middleware.ts`, 各 `app/api/**/route.ts`

## 8. Recommended Migration Waves

1. **Wave 0: Safety Baseline (P0)**
   - `/api/masters/*` を認証・認可必須へ統一。
   - API ガード規約（少なくとも `session` 必須、必要に応じ role 判定）を明文化。
   - 既存 failing test の棚卸しと、移行判定用の最小回帰セット確定。
2. **Wave 1: Architecture Consistency (P0/P1)**
   - DB クライアント方針を決定し、打刻 API の二重接続を解消。
   - 互換 SQL (`to_jsonb/COALESCE`) の利用箇所を一覧化し、削減順序を確定。
3. **Wave 2: Parity Validation (P1)**
   - IN/OUT ペアリング・JST 境界・休憩控除・現場判定をテストで固定化。
   - Repo A 仕様差分は「概念同等」を満たす最小調整のみ実施。
4. **Wave 3: Targeted Gap Closure (P1/P2)**
   - 出力フォーマット差、運用上の不足（監視/健康診断）を小 PR で補完。
   - 互換層を削減し、正規スキーマ前提コードへ収束。

## 9. Recommended First Executable PR

**PR テーマ: `/api/masters/*` の認可ガード統一 + 最小回帰テスト追加（実装は次 PR）**

- 変更範囲（次 PR）
  - `app/api/masters/sites/route.ts`
  - `app/api/masters/machines/route.ts`
  - `app/api/masters/work-types/route.ts`
  - `lib/permissions.ts`（必要ならロール判定ヘルパ追加）
  - `tests/` 配下に 401/403/200 の最小 API テスト
- 受け入れ基準（次 PR）
  - 未ログインは 401。
  - 権限不足は 403。
  - 適切ロールのみ 200 で既存レスポンス形を維持。
- 期待効果
  - A 監査で問題化した認可漏れの再発防止。
  - 以降の parity 作業を安全な API 境界の上で実施可能。

## 10. Regression Test Plan Before / During Migration

- 事前（Before）
  - 認証必須 API のスモーク（reports, sites-report, attendance, masters, cron）。
  - 打刻 API の IN→OUT 正常系と不正入力系（バリデーション）を固定。
- 移行中（During）
  - IN/OUT ペアリング回帰: OUT 先行、IN 重複、open IN 残存。
  - JST 境界回帰: 23:xx/00:xx をまたぐ日付判定。
  - 休憩控除回帰: 除外設定あり/なし、日次・月次一致。
  - 現場レポート回帰: site/machine フィルタ一致、Excel 出力の基本整合。
- 完了判定
  - 主要 API が全て認証/認可基準を満たし、既定レポートの数値一致が維持されること。

## 11. Risks and Guardrails

- リスク: 互換 SQL の長期残存で、仕様不明瞭と性能劣化が進行。
  - Guardrail: 互換利用箇所を台帳化し、各 PR で削減数を追跡。
- リスク: DB クライアント二重化で不具合解析が困難。
  - Guardrail: 接続層方針を 1 つに統一し、例外利用は明示コメント必須。
- リスク: 認可抜け API の温存。
  - Guardrail: `app/api/**/route.ts` に対する auth lint/test を CI に追加（段階導入）。
- リスク: Repo A 由来の Airtable 前提実装が混入。
  - Guardrail: 本計画の「Direct-Port-Prohibited」項目を PR テンプレのチェック項目化。
