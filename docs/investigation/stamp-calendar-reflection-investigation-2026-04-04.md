# 打刻直後にカレンダーへ即時反映されない事象 調査レポート（2026-04-04）

## 1. Executive summary
- 本件の主因は、`POST /api/stamp` が `logs` 挿入後の `sessions` メンテナンスを `queueMicrotask` の fire-and-forget で実行しており、API成功応答（201）と `sessions` 作成成功が分離している点。
- カレンダーAPI（day/month）は `sessions` 主体で表示するため、`logs` 書込成功のみでは即時反映されない設計ギャップが存在する。
- さらに `sessions` 側の open セッション判定は「ユーザー単位で最新 open 1件」を返す仕様で、日跨ぎ/異常データ残存時に新規 IN セッション作成を抑止しうる。
- したがって単一原因ではなく、**(a) 非同期非耐久処理 + (b) open判定の粒度不足 + (c) リトライ不在** の複合要因と判断する。

## 2. Current flow（簡易シーケンス）
1. `StampCard` が `/api/stamp` に打刻 POST。
2. `app/api/stamp/route.ts` がバリデーション・machine/user/site解決後、`logs` へ INSERT。
3. API は成功レスポンスを返却しつつ、`queueMicrotask(() => void handleSessionAfterLogInsert(logId))` で session処理を後段実行。
4. `lib/services/sessions.ts` が `logs` を再読込し、INならopen作成、OUTならopen閉鎖。
5. `app/api/calendar/day|month` は `sessions` を読んで表示データを組成（`logs` は補助/件数用途）。

## 3. Confirmed facts from code
- 打刻APIは `logs` INSERT 後に sessionメンテナンスを **awaitせず** microtask 投入している。
- microtask 側の `handleSessionAfterLogInsert` は内部で例外を catch して error ログのみで終了し、呼び出し元レスポンスへ失敗を反映しない。
- IN時の open 作成は、`findLatestOpenSessionByUser(userId)` が1件でも見つかると `insertOpenSession` をスキップする。
- `insertOpenSession` は `log.machineId` が falsy の場合 return するため、機械ID未解決ログではセッションを作成しない（ただし stamp API 側では machineId 必須解決のため通常経路では発生しにくい）。
- day/monthカレンダーAPIは `sessions` テーブル起点の集計/表示であり、`logs` 単体成功は即時表示保証にならない。

## 4. Most likely root cause(s)
### Root cause A（第一主因）: 非同期 fire-and-forget の非耐久性
- 成功応答後に session更新を別タスク実行しており、プロセス都合・実行順・一時エラー時に `logs` と `sessions` が不整合化する。
- 実装上、呼び出し元が失敗検知/再試行不能なため、取りこぼしが恒久欠損化しやすい。

### Root cause B（副次主因）: open判定がユーザー全体で粗く、作成抑止が起こる
- 新規INで open を作る前に「そのユーザーに open があるか」だけを確認しているため、
  - 前日/異常残存の open が1件でもある
  - あるいは競合タイミングで別INが先にopen化された
  場合に、対象INログの session が作られない。

### Root cause C（再現性悪化要因）: リトライ・補償欠如
- sessionメンテ失敗時の即時再試行/遅延再試行/死信管理がない。
- 結果として「たまたま成功したユーザー」と「欠損が残るユーザー」が分かれる。

## 5. なぜ断続的（全員再現しない）のか
- `queueMicrotask` 由来の実行タイミング依存（同時負荷・インスタンスライフサイクル・DB瞬断影響）が高い。
- open セッション残存の有無がユーザーごとに異なるため、同じ打刻でも成否が分岐する。
- 連続打刻（近接IN/OUT）時は open取得→更新の順序競合で、片方だけ処理される窓が生じる。

## 6. Risk assessment（現実装リスク）
- **可観測性不足**: API成功がデータ整合成功を意味しない。
- **業務影響**: カレンダー未反映で現場は再打刻し、重複/補正作業増加。
- **運用負債**: 後追い修復（手動/バッチ）前提になり、監査説明コスト増。
- **設計負債**: logs⇔sessions の整合責任境界が曖昧。

## 7. Remediation options comparison（A/B/C/D）
| Option | 概要 | 即効性 | 実装コスト | 失敗耐性 | パフォーマンス影響 | 主なトレードオフ |
|---|---|---:|---:|---:|---:|---|
| A | `logs` INSERT 後に sessionメンテを `await` してから 201 返却 | 高 | 低 | 中 | 小〜中（打刻API遅延増） | 失敗を呼び出し元へ返せる一方、レイテンシ増 |
| B | A + 軽量即時リトライ（同一リクエスト内1回） | 高 | 中 | 中〜高 | 中 | 一時DBエラー耐性向上、実装は最小増分で可能 |
| C | `logs` と `sessions` を同一トランザクションで整合更新 | 中 | 中〜高 | 高 | 中 | ドメインルール整理が必要、既存差分はやや大きい |
| D | 永続キュー/ジョブで非同期補償（再試行/DLQ） | 中 | 高 | 最高 | 小（API）/中（運用） | 本命だが導入/監視コストが高く緊急対応向きではない |

## 8. 推奨（緊急安定化の次アクション）
- **近短期は Option B（同期 await + 軽量即時リトライ）を推奨**。
- 理由:
  1. 現行構造を大きく崩さず、`logs` 成功=反映成功 の一致度を最短で上げられる。
  2. 一時的DB失敗に対して補償でき、断続欠損の主因を直接低減できる。
  3. 将来の Option C/D へ段階移行しやすい（観測点を共通化可能）。

## 9. 最小フォローアップ実装計画（別PR）
1. stamp API 内の session処理を同期化し、1回の限定リトライを追加。
2. 失敗時は requestId/logId を含む構造化ログを統一（秘密情報は含めない）。
3. open判定を user単位のみから、少なくとも work_date/stamp整合性を見た条件へ厳密化。
4. 運用用に「logsに存在し sessions未紐付け」を検出する軽量監視SQLを追加。
5. 安定化後、C（transaction）またはD（durable queue）を中期設計として比較検証。

## 補足（今回の調査範囲）
- 本PRでは本番挙動を変更しない（修正は未実施）。
- 既存コード読解とデータフロー評価に限定。
