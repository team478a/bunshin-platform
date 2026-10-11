# OEM Service Product Policy 実装報告

## 1. 調査した内容

- 基準: 2026-10-11の`origin/main` `1919fa9135d9741bf2d4dd5b884b303d6d3731dd`
- OEM正式登録課金V2のApplication計算、履歴台帳、月次確定、請求、共通料金表、管理API、DB制約を確認した。
- Workspace内`R ∪ A`、複数Service Group合算、共通料金表はすでに商品名に依存していない。
- `OemProductPolicy`型、Web validation、DB CHECK、AI研修Gateに`HASSY / MANABERU_STYLE`固定分岐が残っていた。

## 2. 変更したファイル

- `packages/application/src/oem-registration-billing.ts`
- `packages/application/test/oem-registration-billing.test.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261011200000_oem_service_product_policy/migration.sql`
- `packages/database/src/oem-billing-admin.ts`
- `packages/database/src/oem-training-offering.ts`
- `packages/database/src/schema-readiness.ts`
- `packages/database/test/oem-billing.integration-cases.ts`
- `apps/web/src/http/oem-billing-policy.ts`
- `apps/web/src/http/service-commercial-settings.ts`
- `apps/web/test/oem-billing-policy.test.ts`
- `docs/adr/OEM_SERVICE_PRODUCT_POLICY.md`
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`

## 3. 主要な設計判断

- OEMを提供形態、Service Productをワタシワークス管理の商品として分離した。
- 新商品はSUPER_ADMINが`REGISTER_PRODUCT_POLICY`で明示登録する。名称、slug、金額、決済方式から推測しない。
- FREE許可とAI_TRAINING等の必要Capabilityを不変ポリシー版へ保存した。
- `OemOfferingPeriod`が商品とポリシー版を固定し、確定済み人数・価格・請求の既存不変性を変更しない。
- 契約・課金人数・請求は引き続きWorkspace単位とし、商品別請求へ拡張しない。

## 4. 実行した検証

- Prisma schema validate: PASS
- Application typecheck: PASS
- Application unit tests: PASS（136 files / 910 tests）
- Database typecheck: PASS
- Database unit tests: PASS（197 files / 956 tests）
- 隔離PostgreSQL migration: PASS（236 migrations）
- 隔離PostgreSQL integration: PASS（185 tests）
- Web OEM API tests: PASS（6 tests）
- Web全体tests: PASS（468 files / 3295 tests、live-provider 2 files / 2 testsは既存skip）
- architecture tests: PASS（10 tests）
- lint: PASS（Turbo 25/25、learning UIを含む）
- typecheck: PASS（Turbo 25/25、learning UIを含む）
- format check: PASS
- production build: PASS（13/13 tasks）
- `git diff --check`: PASS

DB検証には使い捨てのPostgreSQL 16コンテナと専用DBだけを使用し、検証後に停止・削除した。本番DB・本番資格情報は使用していない。

## 5. 未解決事項

- 商品ポリシーの改定、廃止、一覧・編集UIは後続作業。今回は新商品v1の明示登録とService割当まで。
- 商品別料金、人数単価、初期費用は対象外。共通料金表を維持する。
- 本番既存`product_policy`値、migration lock、Backup/復元、RLS接続roleは未確認。
- 本番Migration、Deploy、商品登録、Offering変更、cutover、請求、実課金は実施しない。

## 6. 次Phaseへ進める条件

1. PRレビューとCI成功。
2. migrationの既存値preflight、lock影響、Backup/復元、RLS roleの人間確認。
3. 本番MigrationとApplication releaseの個別承認。
4. 商品ポリシー管理UIは、この基盤のレビュー後に独立PRで実装する。
