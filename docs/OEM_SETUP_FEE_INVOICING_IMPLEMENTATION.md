# OEM初期費用共通請求 実装報告

## 1. 調査した内容

- OEM正式登録課金指示書、月次`R ∪ A`、共通段階料金、商品台帳、Offering期間、契約、請求書、PDF、CSV、督促、Stripe Checkoutの既存経路を確認した。
- 月額料金と初期費用を分ける要件に対し、現行`TenantInvoice`は必ず1件の月次利用Snapshotを要求し、初期費用の正本・重複防止・商品帰属がないことを確認した。
- 80万円、先行5社30万円は契約・適用条件の本番証跡が未確認で、固定価格や対象判定として安全に自動化できないと判断した。

## 2. 変更したファイル

- `packages/application/src/commercial-billing.ts`
- `packages/application/test/commercial-billing.test.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261011230000_oem_setup_fee_invoicing/migration.sql`
- `packages/database/src/commercial-billing-service.ts`
- `packages/database/src/commercial-billing-support.ts`
- `packages/database/src/commercial-billing.ts`
- `packages/database/src/index.ts`
- `packages/database/src/schema-readiness.ts`
- `packages/database/test/commercial-billing.test.ts`
- `packages/database/test/commercial-billing-schema.test.ts`
- `packages/database/test/oem-billing.integration-cases.ts`
- `packages/database/test/database.integration.test.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/page.tsx`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/commercial-admin-types.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/commercial-invoice-sections.tsx`
- `apps/web/app/(app)/admin/commercial-billing/page.tsx`
- `apps/web/app/(app)/organizations/[workspaceId]/usage/page.tsx`
- `apps/web/src/commercial-invoice-document.ts`
- `apps/web/src/http/commercial-billing-export.ts`
- `apps/web/test/commercial-billing-export.test.ts`
- `apps/web/test/commercial-invoice-document.test.ts`
- `apps/web/test/oem-setup-fee-admin.test.ts`
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/OEM_SETUP_FEE_INVOICING_IMPLEMENTATION.md`

## 3. 主要な設計判断

- `OemSetupFeeCharge`を契約証跡、商品、税込金額、合意日、操作者、理由の不変Snapshotとし、月次人数料金と分離する。
- `TenantInvoiceKind`とsource排他制約を追加し、月額請求は`TenantMonthlyUsage`、初期費用は`OemSetupFeeCharge`だけを参照する。
- 初期費用はSUPER_ADMINが明示確認した場合だけ作成する。active Organization契約と合意日時点の対象商品Offeringを再検証する。
- Organization・商品・請求キーを冪等性境界とし、同じ内容の再送は既存請求を返し、異なる内容は`REVIEW_REQUIRED`で停止する。
- 金額・先行社数・割引条件をコードへ固定しない。請求下書き作成後は既存の発行、PDF、入金、督促、CSV、決済経路を再利用する。
- SnapshotはRLSとDB triggerで更新・削除を拒否する。既存月次請求はdefaultの`MONTHLY_USAGE`として変更しない。

## 4. 実行した検証

- Prisma schema validate: PASS
- Application tests: PASS（136 files / 912 tests）
- Database tests: PASS（197 files / 959 tests）
- Web tests: PASS（471 files / 3311 tests、2 files / 2 tests skipped）
- 対象テスト: Application 6件、Database 18件、Web 7件がPASS
- 隔離PostgreSQL 16で全238 migrationsを新規DBへ適用: PASS
- 隔離PostgreSQL integration: PASS（186 tests）。初期費用の冪等作成・Snapshot不変・RLS拒否も含む。
- Application / Database / Web typecheck: PASS
- Application / Database / Web lint: PASS（0 errors。Webの既存ファイルに未使用`eslint-disable`警告1件）
- Architecture boundary tests: PASS（10 tests）
- Web production build: PASS（Next.js、static pages 35/35）
- `git diff --check`: PASS

## 5. 未解決事項

- 本番契約書、実金額、先行会社の定義・件数、商品Offering、既存請求との関係は未確認。
- 税務・会計上の初期費用の売上認識、返金・取消方針はコードから推測しない。
- 本番Migration、Deploy、初期費用登録、請求発行、メール送信、Stripe Checkout、実決済は実施しない。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. 本番Migrationの既存値、lock影響、Backup/復元、RLS接続roleを人間が確認する。
3. 本番Application releaseを別途承認する。
4. 各初期費用は契約証跡、対象商品、税込金額、合意日を人間が確認し、登録・発行・決済を個別承認する。
