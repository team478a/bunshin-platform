# OEM Offeringポリシー互換性プレビュー 実装報告

## 1. 調査した内容

- 個別Offering移行の実行時互換性検査と、管理画面・レビューCSVの移行可否判定を確認した。
- FREE可否とAI_TRAINING Capability不足は実行時に拒否される一方、操作前には判別できない差分を確認した。

## 2. 変更したファイル

- `packages/application/src/oem-registration-billing.ts`
- `packages/application/test/oem-registration-billing.test.ts`
- `packages/database/src/oem-billing-admin.ts`
- `packages/database/test/oem-billing.integration-cases.ts`
- `apps/web/app/(app)/admin/commercial-billing/products/page.tsx`
- `apps/web/src/http/oem-offering-policy-export.ts`
- `apps/web/test/oem-offering-policy-export.test.ts`
- `apps/web/test/oem-product-policy-admin-ui.test.ts`
- `docs/DECISION_LOG.md`
- `docs/OEM_OFFERING_POLICY_PREFLIGHT_IMPLEMENTATION.md`

## 3. 主要な設計判断

- FREE可否とServiceが要求するCapabilityの判定をApplicationの純粋関数へ集約し、プレビューと実行時検査で共有する。
- Service Program定義が不正または欠落している場合は、互換と推測せずレビュー必須として停止する。
- 管理画面に「互換性確認が必要」絞り込みと具体的な停止理由を追加し、ブロック中の対象には移行フォームを表示しない。
- CSVにも互換性状態と固定reasonを含め、一括移行やDB変更は追加しない。

## 4. 実行した検証

- Application targeted tests: PASS（21 tests）
- Web targeted tests: PASS（12 tests）
- Application / Database / Web typecheck: PASS
- Application全体テスト: PASS（136 files / 910 tests）
- Database全体unit tests: PASS（197 files / 956 tests）
- Web全体テスト: 468 files / 3305 tests PASS、2 files / 2 tests SKIP。全並列実行時にファイル全走査テスト2件がtimeoutしたが、当該2 files / 4 testsの単独再実行はPASSした。
- PostgreSQL 16使い捨て環境: 237 migrations適用成功、OEM Billing対象integration test PASS（1 passed / 184 skipped）
- Application / Database / Web lint: PASS。Webには既存のunused eslint-disable warningが1件ある。
- Architecture tests: PASS（10 tests）
- Web production build: PASS

## 5. 未解決事項

- 本番Service Program定義、商品版、対象Offeringの実互換性は未確認。
- 本番Application release、Offering移行、請求、参加者登録、実課金は実施しない。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. 本番反映はproduction基点の限定releaseとして差分を再確認する。
3. ブロック理由を含む対象ごとの人間レビュー後、実Offering移行は別途明示承認する。
