# Neon連携済み環境における打刻処理置換の検討メモ

作成日: 2026-03-06  
対象: `/nfc` 導線、`/api/stamp`、Neon `logs` 参照系

## 1. 結論（先に要点）

- **Airtable前提の「許可フィールドで絞って create する処理」へは戻さず、Neon書き込みを前提に改善する方針が妥当**です。
- 現行は `/api/stamp` が Neon `logs` に直接 INSERT しており、`decided_site_id` など Airtable時代より構造化された列を保持できます。
- ただし、旧運用と比較して不足があり、特に **サーバー側の拠点再判定** と **重複打刻の冪等性** は補強すべきです。

## 2. 現行（Neon）と旧運用（Airtableレポート）の差分

### 2-1. 保存先とデータ形

- 現行の打刻登録は `logs` テーブルへの `INSERT` です（`stamped_at`, `work_date`, `user_id`, `machine_id`, `decided_site_id`, `work_type_id`, `work_description`, `stamp_type`, `lat`, `lon`, `accuracy_m`, `position_timestamp_ms`, `is_cached_position`）。
- つまり「文字列 `siteName` だけ保存」ではなく、`decided_site_id`（UUID FK）を保持できる設計です。

### 2-2. 初期表示ロジック

- `/nfc` は JST 当日の `logs` を `user_id + work_date` で取得し、最新 `stamp_type` が `IN` なら次を `OUT` にする実装です。
- この点は旧レポートの「同日最終打刻で初期状態を決める」前提と整合しています。

### 2-3. 位置情報・拠点判定

- クライアントでは最寄り拠点を計算して `siteId` を送信しています。
- しかしサーバー側 `/api/stamp` は、受け取った `siteId` を `decided_site_id` 候補として受理するのみで、旧運用にあった「サーバーでの再判定（ポリゴン優先→最近傍）」は行っていません。

### 2-4. 重複対策

- スキーマ上は `logs.unique_key` が存在すればユニークインデックスを作る仕組みがあります。
- ただし `/api/stamp` で `unique_key` を生成して INSERT していないため、現状は実効的な冪等制御がありません。

## 3. 「置換すべきか」の判断

### 判断

- **置換は「Airtable方式へ寄せる」のではなく、「Neon方式を強化する」形で行うべき**。

### 理由

1. 既に主要導線（`/nfc` 初期判定・`/api/stamp` 保存・各種レポート）が Neon `logs` を前提に構成済み。
2. `decided_site_id` や `work_type_id` など、Airtable時代より再集計に強いキーを保持できる。
3. 逆に旧方式へ戻すと、文字列依存や許可フィールド漏れによる情報欠落を再導入するリスクが高い。

## 4. 推奨する最小差分の改善（Neon前提）

1. **サーバー側拠点再判定を追加**
   - `/api/stamp` で `sites` を参照し、ポリゴン内判定優先・外れたら最近傍で `decided_site_id` を再計算。
   - クライアント送信値は監査用（参考値）に留める。

2. **冪等キーの導入**
   - 例: `user_id + stamp_type + rounded(stamped_at)` から `unique_key` を生成し `ON CONFLICT DO NOTHING`（または更新）を採用。
   - 二重送信・再試行時の重複を抑止。

3. **クライアント/サーバーのフィールド名を統一**
   - いまクライアントは `positionTimestamp` を送っている一方、サーバーは `positionTimestampMs` / `position_timestamp_ms` を受理。
   - 命名を合わせ、`position_timestamp_ms` の欠落を防ぐ。

4. **拠点名スナップショット方針を明文化**
   - レポートは `decided_site_name_snapshot` を参照しているため、打刻時に名前スナップショットを保存するか、参照時 JOIN で解決するかを統一。

## 5. 変更判断メモ（Why / Impact / Rollback）

- Why: Neon移行済みの実装整合を保ったまま、旧運用で課題だった重複・拠点確定の弱さを補うため。
- Impact: 集計の安定性向上、二重打刻の抑制、運用時の説明容易化。
- Rollback: 追加列や `unique_key` 生成を feature flag 化し、段階的に無効化可能な形で導入する。
