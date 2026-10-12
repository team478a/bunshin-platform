# OEM Service Productポリシー管理UI 実装報告

## 1. 調査した内容

- 基準: PR #1231マージ後の`origin/main` `64f2ac997c55411452311032f3271f3a00cd2c60`
- 既存の請求管理、共通料金表管理、SUPER_ADMIN認可、商品台帳、不変ポリシー版、Offering割当を確認した。
- 新商品v1の登録APIは存在したが、一覧、改定、廃止の管理画面と安全な操作境界が未実装だった。

## 2. 変更したファイル

- `apps/web/app/(app)/admin/commercial-billing/page.tsx`
- `apps/web/app/(app)/admin/commercial-billing/products/page.tsx`
- `apps/web/test/oem-product-policy-admin-ui.test.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261011220000_oem_product_policy_admin/migration.sql`
- `packages/database/src/oem-billing-admin.ts`
- `packages/database/src/schema-readiness.ts`
- `packages/database/test/oem-billing.integration-cases.ts`
- `docs/DECISION_LOG.md`

## 3. 主要な設計判断

- 管理画面は新規登録、全商品・全ポリシー版の一覧、将来適用の改定、廃止に限定した。
- 改定は既存レコードを変更せず、単調増加する新しい不変版を追加する。
- 廃止は新規Offering割当だけを停止し、既存Offering・参加者・請求履歴を変更しない。
- 改定と廃止はSUPER_ADMIN再認証、理由、明示確認、advisory lock、表示時のポリシー版との一致を必要とする。
- 廃止理由、操作者、日時を商品台帳へ保存し、DB CHECKで中途半端な廃止状態を、DB triggerで廃止後の再有効化・根拠改変を拒否する。

## 4. 実行した検証

- Prisma schema validate: PASS
- 隔離PostgreSQL migration: PASS（237 migrations）
- 隔離PostgreSQL integration: PASS（185 tests）
- Database typecheck / unit tests: PASS（197 files / 956 tests）
- Web typecheck / targeted tests: PASS（8 tests）
- Web全体tests: PASS（469 files / 3297 tests、live-provider 2 files / 2 testsは既存skip）
- architecture tests: PASS（10 tests）
- lint: PASS（Turbo 25/25、learning UIを含む）
- typecheck: PASS（Turbo 25/25、learning UIを含む）
- format check: PASS
- production build: PASS（13/13 tasks、新規`/admin/commercial-billing/products`を含む）
- `git diff --check`: PASS

DB検証には使い捨てのPostgreSQL 16コンテナと専用DBだけを使用し、DB名・識別マーカーを再確認してから削除した。本番DB・本番資格情報は使用していない。

## 5. 未解決事項

- 廃止商品の再有効化、表示名変更、商品削除は未実装。履歴保全のため自動復帰や削除は行わない。
- ポリシー改定を既存Offeringへ適用する操作は未実装。各Offeringの人間レビューを伴う独立機能とする。
- 本番既存値、Migration lock、Backup/復元、RLS接続roleは未確認。
- 本番Migration、Deploy、商品登録・改定・廃止、Offering変更、請求、実課金は実施しない。

## 6. 次Phaseへ進める条件

1. PRレビューとCI成功。
2. 本番Migrationのlock影響、Backup/復元、RLS roleの人間確認。
3. 本番MigrationとApplication releaseの個別承認。
4. 既存Offeringへの新版適用が必要な場合は、対象一覧・影響確認・個別承認を備えた独立PRとする。
