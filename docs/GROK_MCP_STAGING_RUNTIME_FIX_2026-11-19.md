# Grok MCP staging Runtime修正報告

## 1. 調査した内容

隔離Grok PoCでOAuth認可とtoken交換後、Grokから`POST /api/mcp`が到達したが503となった。`createExternalReadCredentialServices`とGrant管理が`APP_ENV=staging`を一律停止しており、OAuth同意だけstaging対応した構成との不整合を確認した。

## 2. 変更したファイル

- `packages/application/src/external-connection-read.ts`
- `apps/web/src/services/external-read-credential.ts`
- `apps/web/src/services/external-read-grant-owner.ts`
- 関連Webテスト
- `packages/database/prisma/migrations/20261119010000_external_read_staging_environment/migration.sql`
- `packages/database/src/schema-readiness.ts`
- migration境界テスト
- `docs/DECISION_LOG.md`
- 本報告

## 3. 主要な設計判断

- stagingをdevelopmentまたはproductionへ読み替えず、Grantの独立環境値として扱う。
- reviewed client catalogが空の場合は、全環境で従来どおり外部読取を停止する。
- 既存GrantテーブルのCHECK制約だけを拡張し、新しいテーブル、権限、tool、管理画面は追加しない。
- Workspace / Service / Membership / User / Bunshin、操作別Grant、一意性、期限、失効の既存検証を維持する。

## 4. 実行した検証

Node.js 24.22.3、pnpm 10.10.0で次を実行した。

- `pnpm format:check`: 成功
- `pnpm typecheck`: 25/25タスク成功
- `pnpm lint`: 成功（既存warning 4件、error 0件）
- `pnpm test`: 25/25タスク成功。Webは595 files／4,409 tests成功、3 files／3 tests skip
- `pnpm build`: 13/13タスク成功
- staging credential、Grant owner、migration境界の対象テスト: 成功
- `git diff --check`: 成功

隔離Supabaseへのmigration適用、PoC環境へのデプロイ、Grok実接続の再確認は未実施であり、PRレビュー後に明示承認を得て行う。

## 5. 未解決事項

- このコード変更だけでは隔離DBへmigrationは未適用であり、実Grok tool invocationも未検証。
- 3操作のGrant発行、解除後拒否、別User・別Service拒否を実機で確認する必要がある。
- 本番設定、本番DB、有料API、SNS投稿は変更しない。

## 6. 次Phaseへ進める条件

1. 標準検証とPR CIが成功する。
2. レビュー後に隔離PoC環境だけへデプロイする。
3. 隔離DBだけへmigrationを適用し、MCP初期化と3操作を確認する。
