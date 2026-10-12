# OEM Offering商品ポリシー移行 実装報告

## 1. 調査した内容

- Service Product台帳、不変ポリシー版、既存Offering期間、管理UIの改定・廃止操作を確認した。
- ポリシー改定は既存Offeringを自動変更せず、個別レビューを後続作業としていた。

## 2. 変更したファイル

- `packages/database/src/oem-billing-admin.ts`
- `packages/database/test/oem-billing.integration-cases.ts`
- `apps/web/app/(app)/admin/commercial-billing/products/page.tsx`
- `apps/web/test/oem-product-policy-admin-ui.test.ts`
- `docs/DECISION_LOG.md`
- `docs/OEM_OFFERING_POLICY_MIGRATION_IMPLEMENTATION.md`

## 3. 主要な設計判断

- 一括backfillは実装せず、現在のOffering 1件ごとに新版を適用する。
- Organization、Service、現在版、FREE可否、Capability差分、適用日を操作前に表示する。
- 現在Offering IDと現在ポリシー版IDをCASにし、将来適用版、同版・旧版、廃止商品、互換性違反を拒否する。
- 適用時は旧期間を終了し、新しいOffering期間を追加する。参加者、請求履歴、過去期間は変更しない。

## 4. 実行した検証

- Database typecheck / unit tests: PASS（197 files / 956 tests）
- Web typecheck / targeted UI tests: PASS（2 tests）
- 隔離PostgreSQL migration: PASS（237 migrations）
- 隔離PostgreSQL integration: PASS（185 tests）
- architecture tests: PASS（10 tests）
- 全体tests: PASS（25/25 tasks、Web 469 files / 3297 tests、live-provider 2 files / 2 testsは既存skip）
- lint: PASS（25/25 tasks。既存`apps/web/app/consent/page.tsx`のunused eslint-disable警告1件のみ）
- typecheck: PASS（25/25 tasks、learning UIを含む）
- format check: PASS
- production build: PASS（13/13 tasks、`/admin/commercial-billing/products`を含む）
- `git diff --check`: PASS

DB検証には使い捨てのPostgreSQL 16コンテナと専用DBだけを使用し、検証後に停止・削除した。本番DB・本番資格情報は使用していない。

## 5. 未解決事項

- 本番データでの対象Offering、最新版、互換性は未確認。
- 本番Migration、Deploy、商品改定、Offering移行、請求、実課金は実施しない。

## 6. 次Phaseへ進める条件

1. PRレビューとCI成功。
2. 本番対象Offeringごとの人間レビュー。
3. 本番Application releaseと各Offering移行の個別承認。
