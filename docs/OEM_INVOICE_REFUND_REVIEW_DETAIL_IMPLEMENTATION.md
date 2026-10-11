# OEM請求 返金要照合・団体別調査導線 実装報告

## 1. 調査した内容

- 全体請求画面では返金要照合を検知し、対象団体の請求画面へ移動できる。
- 移動先の団体別請求画面には返金通知が表示されず、どの請求・Stripe Eventを照合すべきか確認できなかった。
- 既存`CommercialBillingWebhookEvent`にはWorkspace、請求、返金区分、Provider Event ID、受信日時が保存されているため、schema追加なしで調査情報を表示できる。

## 2. 変更したファイル

- `packages/database/src/commercial-billing-service.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/commercial-invoice-sections.tsx`
- 関連テスト
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/OEM_INVOICE_REFUND_REVIEW_DETAIL_IMPLEMENTATION.md`

## 3. 主要な設計判断

- 団体別DashboardのWorkspace条件を正本とし、その配下の各請求に紐づく処理済み返金通知だけを取得する。
- `PARTIAL_REFUND_REVIEW_REQUIRED`と`FULL_REFUND_REVIEW_REQUIRED`だけを受信日時の降順で表示する。
- 表示は返金区分、受信日時、Stripe Event IDに限定する。Webhook本文、カード情報、保存されていない返金額を推測しない。
- 返金通知は調査証跡として扱い、内部請求状態、金額、入金日、請求書Snapshotを更新しない。
- 要照合の解消操作は、会計・取消方針が承認されるまで追加しない。

## 4. 実行した検証

- 対象Database tests: PASS（1 file / 14 tests）
- 対象Web tests: PASS（1 file / 4 tests）
- Database全体tests: PASS（197 files / 961 tests）
- Web全体tests: PASS（471 files / 3319 tests、2 files / 2 tests skipped）
- Web / Database typecheck: PASS
- Web / Database lint: PASS
- スマートフォン幅の合成E2E: PASS（3 files / 13 tests）
- Architecture boundary tests: PASS（10 tests）
- Prettier / `git diff --check`: PASS
- Web production build: PASS（Next.js、static pages 35/35）

## 5. 未解決事項

- 返金の会計確定日、売上認識、部分返金後残高、取消文書、返金済み請求状態は未決定。
- Webhook台帳は累計返金額を保存していないため、返金額はStripeと会計記録で照合する。
- 要照合の解消操作、本番Stripe Webhook購読、実返金、既存返金データの照合は未実施。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. production基点の限定releaseを別途レビューする。
3. 本番Webhook購読変更と実返金はそれぞれ明示承認を得る。
4. 請求状態変更や要照合解消を実装する前に、部分／全額返金の会計・取消方針を承認する。
