# Codex運用ガイド（このリポジトリ専用）

最終更新: 2026-03-24

## 1. 目的

この文書は、Codex が本リポジトリを保守するときの実務ルールを定義する。
対象は **変更設計、実装修正、ドキュメント更新、差分レビュー**。

---

## 2. システム不変条件（Invariants）

1. **最新リポジトリ状態が常に正**（旧 docs よりコード優先）。
2. デプロイ経路は **GitHub → Vercel**。
3. Primary DB は **Neon Postgres**（`DATABASE_URL` / `NEON_DATABASE_URL`）。
4. DBアクセスは **サーバー側のみ**（Route Handler / Server Component / server-only lib）。
5. 機密情報をクライアントへ露出しない（`NEXT_PUBLIC_*` 以外）。
6. 新規追加の runtime は原則 `nodejs`。Edge 化は明示理由と互換確認がある場合のみ。

---

## 3. ソースオブトゥルース優先順位

1. 実装コード（`app/**`, `lib/**`, `components/**`）
2. 実行設定（`package.json`, `next.config.ts`, `middleware.ts`, `vercel.json`）
3. スキーマ/SQL（`migrations/**`, `docs/sql/**`）
4. テスト（`tests/**`）
5. 既存 docs（`docs/**`）

矛盾があれば上位を採用し、docs を更新する。

---

## 4. リポジトリ読取順（推奨）

1. `package.json` / `pnpm-lock.yaml` / `tsconfig.json` / `next.config.ts` / `middleware.ts` / `lib/auth.ts`
2. `app/**`（画面）と `app/api/**`（HTTP契約）
3. `lib/**`（DB、env、validation、service）
4. `migrations/**`, `docs/sql/**`（実テーブル仕様）
5. `docs/**`（差分検出・文書整合）

---

## 5. Safe Change Policy（安全な変更方針）

- 最小差分を徹底する。
- 依頼がドキュメント更新の場合、**コード変更は原則しない**。
- 変更は1目的1コミットに寄せる。
- 無関係な整形・命名変更を混ぜない。
- try/catch を import に巻かない。

禁止事項:
- ルート/API/テーブル/env/integration を推測で新設しない。
- シークレット値や `.env` 実値を docs に記載しない。
- client component へ DB 接続や secret 参照を追加しない。

---

## 6. 変更時の必須確認

### 6.1 実装整合
- architecture 記述が実際のディレクトリ構成と一致するか。
- API 一覧が `app/api/**/route.ts` と一致するか。
- DB 記述が SQL/migration と一致するか。
- auth 記述が `middleware.ts` と `lib/auth.ts` と一致するか。
- env 記述が `process.env.*` 実参照と一致するか。

### 6.2 セキュリティ
- SQL はパラメータ化されているか。
- 入力は Zod または同等の検証を通すか。
- 機密値をログに出していないか。

---

## 7. ドキュメント更新トリガー

以下の変更が入ったら、`docs/basic-design`・`docs/detailed-design`・`docs/agent.md` を見直す:

1. API ルート追加/削除/HTTP メソッド変更
2. 認証/認可ロジック変更
3. DB スキーマ変更（新規列・制約・インデックス含む）
4. env 参照キー変更
5. runtime 変更（node ↔ edge）
6. 外部連携（Blob/Cron 等）追加・削除

---

## 8. 詳細設計の記述テンプレート

機能ごとに、必ず次の順で記述する:

1. objective
2. related files
3. screen/route
4. API I/O
5. validation
6. DB read/write
7. auth/permission checks
8. error handling
9. state transitions / business rules
10. test points / known gaps

---

## 9. 出力契約（今後のCodex実行）

- 「何を根拠にそう書いたか」がファイルで追跡可能であること。
- 推測文言（例: たぶん / 想定 / 予定）を避ける。
- docs 間で同じ項目（API一覧、env一覧、auth要件）を矛盾させない。
- 日本語で簡潔に、運用で再利用できる粒度で記載する。

---

## 10. 受け入れチェックリスト

- [ ] 最新実装を優先して docs を更新した
- [ ] 基本設計と詳細設計で API・DB・auth・env の整合が取れている
- [ ] `docs/agent.md` に運用ルール、更新トリガー、テンプレートがある
- [ ] 秘密情報や実トークンを記載していない
- [ ] 差分が最小で、無関係ファイルを変更していない

