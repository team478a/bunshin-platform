# OEM請求 返金要照合CSV出力 実装報告

## 1. 調査した内容

- 全体請求画面と団体別請求画面では返金要照合を確認できるが、経理用CSVには返金通知の識別情報がなかった。
- 既存の全体請求Dashboardは請求ごとの最新返金要照合通知を抽出済みだが、Stripe Event IDを返していなかった。
- 経理用CSVには認可、`private, no-store`、Spreadsheet Formula Injection対策が実装済みであり、同じ出力境界を拡張できる。

## 2. 変更したファイル

- `packages/database/src/commercial-billing-service.ts`
- `apps/web/src/http/commercial-billing-export.ts`
- 関連テスト
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/OEM_INVOICE_REFUND_REVIEW_EXPORT_IMPLEMENTATION.md`

## 3. 主要な設計判断

- 各請求について最新の処理済み部分／全額返金通知1件だけを既存DashboardからCSV生成へ渡す。
- 既存列の位置を維持するため、`返金要照合区分`、`返金通知受信日時`、`Stripe Event ID`を末尾へ追加する。
- 通知がない請求の追加列は空欄とし、未知の状態を安全と推測しない。
- Stripe Event IDにも既存のCSV数式対策を適用する。
- 返金額、会計確定日、返金済み請求状態を推測せず、内部請求台帳を更新しない。

## 4. 実行した検証

- 対象Database tests: PASS（1 file / 14 tests）
- 対象Web tests: PASS（1 file / 3 tests）
- Database全体tests: PASS（197 files / 961 tests）
- Web全体tests: PASS（471 files / 3320 tests、2 files / 2 tests skipped）
- Web / Database typecheck: PASS
- Web / Database lint: PASS
- スマートフォン幅の合成E2E: PASS（3 files / 13 tests）
- Architecture boundary tests: PASS（10 tests）
- Prettier / `git diff --check`: PASS
- Web production build: PASS（Next.js、static pages 35/35）

## 5. 未解決事項

- Webhook台帳は累計返金額を保存していないため、CSVに返金額は出力しない。
- CSVはStripeと会計記録の照合対象を識別する補助資料であり、会計帳簿や返金確定資料ではない。
- 要照合の解消操作、本番Webhook購読、実返金、既存返金データの照合は未実施。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. production基点の限定releaseを別途レビューする。
3. 本番Webhook購読変更と実返金はそれぞれ明示承認を得る。
4. 請求状態変更や要照合解消を実装する前に、部分／全額返金の会計・取消方針を承認する。
