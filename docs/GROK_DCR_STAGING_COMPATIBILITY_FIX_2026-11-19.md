# Grok DCR staging互換修正報告

## 1. 調査した内容

Grok WebのCustom MCP画面と隔離PoCを確認した。画面入力は名前、MCP URL、任意HTTPヘッダーだけで、OAuth Client IDを指定できない。GrokはSupabase OAuth ServerのDCRを使い、接続試行ごとに新しいpublic client IDを発行した。

従来のreviewed catalogは1つの固定client IDだけを許可するため、接続試行で発行された新clientは`OAuth consent unavailable`で拒否される。環境変数を後から新IDへ差し替えても、元のauthorization requestは失敗済みとなり再開できなかった。

## 2. 変更したファイル

- `apps/web/src/services/external-read-oauth-client.ts`
- `apps/web/src/services/oauth-consent.ts`
- `apps/web/test/external-read-oauth-client.test.ts`
- `packages/config/src/index.ts`
- `packages/config/test/environment.test.ts`
- `docs/DECISION_LOG.md`
- 本報告

## 3. 主要な設計判断

- 固定client IDの完全一致を既定とし、Productionの挙動は変えない。
- `EXTERNAL_READ_OAUTH_DYNAMIC_CLIENTS_ENABLED=true`は`APP_ENV=staging`かつ完全なSupabase Auth Admin設定・reviewed client templateがある場合だけ受理する。
- DCR client IDは信頼せず、Supabase Admin OAuth APIの`getClient`で毎回登録情報を再取得する。
- `client_name=Grok`、public、dynamic、`token_endpoint_auth_method=none`、`authorization_code + refresh_token`、`response_type=code`、reviewed redirect URIの集合完全一致を必須とする。
- 表示名とcallbackはreviewed templateから投影し、DCRの自己申告値をそのまま画面に出さない。
- OAuthの認証・認可と業務読取Grantを分離し、本修正でGrant発行、AI生成、SNS投稿の副作用は追加しない。

## 4. 実行した検証

- `@bunshin/config` targeted test: 14件成功
- `web` OAuth targeted test: 46件成功
- `pnpm typecheck`: 成功
- `pnpm lint`: 成功（変更外の既存warning 4件）
- `pnpm build`: 13 package成功、終了コード0
- `pnpm test`: 変更対象のテストは成功。全体は変更外のdatabase test 4件が実行時間上限を超えて終了コード1
  - `apply-release-20261020.test.ts`
  - `deployment-database-gate.test.ts`
  - `public-rls-schema.test.ts`
  - `reproduction-challenge-review-admin.test.ts`
- 変更ファイルのPrettier確認と自動整形: 成功
- `git diff --check`: 成功
- リポジトリ全体の`pnpm format:check`は、Git管理外のローカル`.pnpm-store`を走査して構文エラーとなり、変更外の既存`.github/workflows/production-line-go-no-go.yml`にもwarningがあるため、変更ファイル単位で確認した。

## 5. 未解決事項

- 隔離Supabase preview branchとVercel custom environmentで新フラグを有効化し、Grokから新しいauthorization requestを作った実機再検証は未実施。
- メールログイン、本人同意、操作別Grant発行、3 MCP tool、Grant解除後の拒否、別User・別Service拒否を通して確認する必要がある。
- 本番設定、本番DB、有料API、SNS投稿、マージ、デプロイは行っていない。

## 6. 次Phaseへ進める条件

1. PR CIが標準検証に成功する。
2. レビュー後に隔離PoC環境へのみ反映する。
3. 新しいGrok接続試行でDCR clientメタデータ検証、本人認可、Grant分離、解除を通して確認する。
