# OEM Offeringポリシー履歴・検索 実装報告

## 1. 調査した内容

- Service Product管理画面、個別Offering移行、`OemOfferingPeriod`期間台帳を確認した。
- 期間台帳には開始・終了、商品ポリシー版、操作者、理由が既にあり、移行履歴の正本として利用できることを確認した。

## 2. 変更したファイル

- `packages/database/src/oem-billing-admin.ts`
- `packages/database/test/oem-billing.integration-cases.ts`
- `apps/web/app/(app)/admin/commercial-billing/products/page.tsx`
- `apps/web/test/oem-product-policy-admin-ui.test.ts`
- `docs/DECISION_LOG.md`
- `docs/OEM_OFFERING_POLICY_HISTORY_IMPLEMENTATION.md`

## 3. 主要な設計判断

- 新しい履歴tableやmigrationは追加せず、既存の期間台帳を読み取り専用で表示する。
- Organization名、Service名・slug、商品名・キーによるSUPER_ADMIN限定検索と、商品・移行要否の絞り込みを追加する。
- 現在のOfferingと履歴は最大200件に制限する。履歴が超過した場合は黙って全件取得せず、画面で追加の絞り込みを求める。
- 個別移行の明示確認、CAS、互換性検査を変更せず、一括適用は追加しない。

## 4. 実行した検証

- Database typecheck: PASS
- Web typecheck: PASS
- Database unit tests: PASS（197 files / 956 tests）
- Web tests: PASS（469 files / 3297 tests、live-provider 2 files / 2 testsは既存skip）
- 隔離PostgreSQL 16への全237 migration: PASS
- 対象OEM integration test: PASS（1 test、184 skipped）
- Database / Web lint: PASS（既存`apps/web/app/consent/page.tsx`のunused eslint-disable警告1件のみ）
- Web production build: PASS（`/admin/commercial-billing/products`を含む）
- `git diff --check`: PASS

DB検証には使い捨てのPostgreSQL 16コンテナと専用DBだけを使用し、検証後に停止・削除した。本番DB・本番資格情報は使用していない。

## 5. 未解決事項

- 本番データでの検索結果、履歴件数、移行対象は未確認。
- 本番Application release、Offering移行、請求、参加者登録、実課金は実施しない。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. 本番反映はproduction基点の限定releaseとして差分を再確認する。
3. 実Offering移行は対象ごとに人間が確認し、別途明示承認する。
