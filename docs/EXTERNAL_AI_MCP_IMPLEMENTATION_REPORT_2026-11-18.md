# PR-05 外部AI共通MCP 実装報告

## 1. 実装した機能

- 認証付きRemote MCP endpoint `/api/mcp`
- 読取専用tool `get_member_activity`、`get_daily_post_ideas`、`get_campaign_brief`
- RFC 9728 Protected Resource Metadata（origin形式とpath-specific形式）
- 操作別consent v2の発行・一覧・解除UI
- OAuth tokenのMCP resource audience検証と、tokenから操作別Grantを解決する処理

## 2. 再利用した既存機能

- `ExternalReadGrant`、`ExternalConnectionRead`、既存の失効・期限・所属・SOCIAL Capability再検証
- `GetMemberUsageSummary` / `PrismaMemberUsageRepository`
- `PrismaDailyMissionAccessRepository`
- `PrismaCampaignRepository.listPlanningContexts`
- Supabase JWT署名・本人・session検証、既存client catalog
- 既存のFeature Entitlement、Bunshin/User/Service/Workspace境界

## 3. 追加・変更したファイル

- Application: `external-ai-read.ts`、external read operation / credential / consent v2
- Database: `external-ai-read-projections.ts`、Grant operation解決、migration `20261118030000_external_ai_mcp_operations`
- Web: MCP handler、HTTP/OAuth metadata routes、resource audience検証、既存接続許可画面
- Test: MCP protocol、strict empty input、credential、Grant管理、PostgreSQL統合case
- Documentation: 本ADR、Decision Log、本報告

共有ファイルの変更: `packages/application/src/index.ts`、`packages/database/src/index.ts`、`packages/database/src/schema-readiness.ts`、`docs/DECISION_LOG.md`、`pnpm-lock.yaml`。既存exportは削除していない。

## 4. DB・API・管理画面への影響

- 新規テーブルなし。既存`external_read_grants_validity_check`を、legacy v1の利用実績許可を維持しながら、v2の3操作へ拡張する。
- `/api/mcp`と`/.well-known/oauth-protected-resource`を追加する。
- 既存の外部読取許可画面で、情報種類を個別に選択・解除できる。新しい管理画面は追加しない。
- 既存の通常HTTP読取、ハッシー、マナベル、占い、OEMのProvider依存処理は変更しない。

## 5. テスト実施結果

- Node 24でApplication全体: 1,251件成功、Database全体: 1,402件成功
- Web全体: 4,395件成功、3件live test skip。既存の用語走査1件が全体並列時のみ5秒timeoutとなり、単独再実行では2件成功
- Web MCP / credential / Grant HTTPの対象test: 46件成功
- MCP `tools/list`で3 toolだけを公開し、任意User ID引数を拒否することを確認
- `pnpm typecheck`: package 25/25成功。学習UI fixtureをconsent v2へ更新後、補助型検査も成功
- `pnpm lint`: 25/25成功。変更外の既存unused-disable警告4件、error 0件
- `pnpm build`: 13/13成功。`/api/mcp`と2つのProtected Resource Metadata routeをproduction buildで確認
- Prisma schema validate: 成功（ローカルの秘密情報を使わず、構文検証用URLを指定）
- `git diff --check`: 成功。変更ファイルのPrettier検査: 成功
- 使い捨てPostgreSQL 16で、変更したGrant上限の対象integration test: 1件成功。専用containerは検証後に削除
- PR CI database: migration 278件、schema readiness、integration 433件、native transaction / migration履歴、TLS検証がすべて成功
- PR CI verify: format / typecheck / lint / test / external-read PoC / learning UI / buildがすべて成功
- 独立確認で判明した複数Grant候補の先行2件絞り込みを廃止し、資格に結合された候補が厳密に1件の場合だけ対象を解決するよう修正。3件以上かつ複数Bunshin・複数セッションの回帰テストを追加
- 修正後、使い捨てPostgreSQL 16で上記回帰テスト1件が成功。database packageのtypecheck、lint、単体テスト1402件も成功

## 6. 本番で利用できる範囲

コード実装済み。client catalogは空であり、Production OAuth client、resource audience hook、MCP接続設定は未反映のため、本番の外部AIからは利用できない。

## 7. 未実装・未検証項目

- Grok Botの実アカウント接続、実OAuth consent、実tool invocation
- Supabase ProductionのOAuth client登録とcustom access-token hook
- Grant解除後のGrok実機拒否、別User／別ServiceのGrok実機拒否
- Muse固有Connector

## 8. 残るリスク

- Grok側のCustom Connector UIとSupabase OAuthの実際のredirect URI・client認証方式はPR-06で実機照合が必要。
- 既存の資格結合はGrantのconnection IDを必要とする。IDをMCP tool引数やpromptへ渡さず、1つのGrok OAuth sessionへ3つの操作別Grantを安全に結合する公式導線をPR-06で確定する必要がある。確定できない場合は共通の結合Adapterを別変更として設計する。
- Supabase custom OAuth scopeは利用できないため、業務操作権限は引き続きDB Grantで強制する必要がある。
- 本番APP_URLとtoken `aud`が一致しなければ、MCPはfail-closedで401となる。

## 9. 次のPRで実装する内容

PR-06で独立検証環境のSupabase OAuth client / audience hookを設定し、本人1アカウントでGrok Bot実接続、3 tool、解除、別User・別Service拒否を確認する。外部アカウント作成・接続許可・有料実行は承認後に限定する。

## 10. PR URL

https://github.com/team478a/bunshin-platform/pull/1532
