# OEM OfferingポリシーレビューCSV 実装報告

## 1. 調査した内容

- Offering検索・移行履歴画面と、既存の管理者CSV出力・表計算ソフト対策を確認した。
- 本番移行前の人間レビューでは、現在の移行候補と終了済み期間を分けて確認できる出力が必要と判断した。

## 2. 変更したファイル

- `packages/database/src/oem-billing-admin.ts`
- `apps/web/src/http/oem-offering-policy-export.ts`
- `apps/web/app/api/admin/commercial-billing/offering-policies/export/route.ts`
- `apps/web/app/(app)/admin/commercial-billing/products/page.tsx`
- `apps/web/test/oem-offering-policy-export.test.ts`
- `apps/web/test/oem-product-policy-admin-ui.test.ts`
- `docs/DECISION_LOG.md`
- `docs/OEM_OFFERING_POLICY_EXPORT_IMPLEMENTATION.md`

## 3. 主要な設計判断

- 現在の移行レビュー対象と期間台帳履歴を別CSVにする。
- 管理画面と同じOrganization・Service・商品条件を維持し、現在一覧では移行要否も反映する。
- 10,000件を超える場合は部分CSVを返さず、413と固定理由を返す。
- SUPER_ADMIN認可、非キャッシュ、MIME sniff防止、CSV数式注入防止を必須にする。
- 読み取り専用とし、一括移行やDB変更は追加しない。

## 4. 実行した検証

- Database / Web typecheck: PASS
- Database unit tests: PASS（197 files / 956 tests）
- Web tests: PASS（470 files / 3306 tests、live-provider 2 files / 2 testsは既存skip）
- Targeted Web tests: PASS（11 tests）
- 隔離PostgreSQL 16への全237 migration: PASS
- 対象OEM integration test: PASS（1 test、184 skipped）
- Database / Web lint: PASS（既存`apps/web/app/consent/page.tsx`のunused eslint-disable警告1件のみ）
- Architecture tests: PASS（10 tests）
- Web production build: PASS（新しいCSV routeを含む）
- 変更ファイルformat / `git diff --check`: PASS

## 5. 未解決事項

- 本番データ件数、実CSV内容、表計算ソフトでの運用確認は未実施。
- 本番Application release、Offering移行、請求、参加者登録、実課金は実施しない。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. 本番反映はproduction基点の限定releaseとして差分を再確認する。
3. CSVを用いた対象ごとの人間レビュー後、実Offering移行は別途明示承認する。
