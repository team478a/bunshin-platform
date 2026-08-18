# Phase 2 Slice 2.4-A Core Persistence 実装報告

## 1. 調査した内容

既存`@bunshin/capability-contract`のCapabilityType、Bunshin管理policy、Workspace/Bunshin scoped Repository、上位仕様のCapability Contractを確認した。Capability固有handlerやProviderをCoreへ持ち込まず、Assignmentと実行前guardだけでPhase 2の境界を成立させた。

## 2. 変更したファイル

- `packages/capability-contract/src/index.ts`
- `packages/application/src/index.ts`
- `packages/application/test/capability-assignment.test.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260819090000_bunshin_capability_assignments/migration.sql`
- `packages/database/src/index.ts`
- `packages/database/test/database.integration.test.ts`
- `packages/database/vitest.config.ts`
- `docs/DECISION_LOG.md`
- 本報告書

## 3. 主要な設計判断

- CapabilityTypeとAssignment型は`@bunshin/capability-contract`を正本とする。
- `workspaceId + bunshinId + capabilityType`をDB unique制約で保護する。
- assign/activate/suspendを冪等にし、LOCKEDを通常管理操作で変更できないようにする。
- configは空objectで作成し、Coreでは内容を解釈しない。
- `RequireActiveBunshinCapability`はACTIVEだけを許可し、未割当・停止・LOCKEDを拒否する。
- 既存`canManageBunshin`を再利用し、Platform Admin overrideを追加しない。

## 4. 実行した検証

- Prisma generate / validate
- format check
- typecheck
- lint
- unit test
- PostgreSQL integration test
- production build
- GitHub Actions `verify` / `database`

## 5. 未解決事項

- LOCKEDへの遷移・解除はPlan/課金/運営権限の設計まで提供しない。
- Capability固有config schema、handler、Provider、実行routeは各後続Phaseで実装する。
- Production migrationとbrowser smokeはProduction Gateとして残る。

## Rollback

本番適用後に戻す必要がある場合は、Assignmentデータの退避を確認してから、外部キー、`bunshin_capability_assignments`、追加enumの順に削除するforward-fix migrationを作成する。適用済みmigrationを直接編集しない。

## 6. 次Phaseへ進める条件

本PRをレビュー・マージし、Slice 2.4-B authenticated API/UIのHTTP contractを別指示書で承認する。Phase 2ではSOCIALの割当管理だけを公開し、SOCIAL処理自体は実装しない。
