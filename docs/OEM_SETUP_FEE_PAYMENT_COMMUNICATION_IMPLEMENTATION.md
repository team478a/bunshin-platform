# OEM初期費用 決済・督促表示整合 実装報告

## 1. 調査した内容

- OEM初期費用は請求台帳、PDF、CSV、管理画面で月額利用料から分離済みだった。
- Stripe Checkoutの商品名、保存済み支払方法による自動回収の明細、督促メールの件名・本文に`OEM月額利用料`の固定文言が残っていた。
- 決済金額、Workspace、請求番号、Webhook照合、冪等性は既存の`TenantInvoice`を正本としており、表示分岐だけが不足していた。

## 2. 変更したファイル

- `apps/web/src/commercial-invoice-copy.ts`
- `apps/web/src/payments/commercial-invoice-payment.ts`
- `apps/web/src/payments/commercial-invoice-automatic-collection.ts`
- `apps/web/src/payments/stripe-checkout.ts`
- `apps/web/src/payments/stripe-automatic-collection.ts`
- `apps/web/src/email/commercial-billing-reminder.ts`
- `apps/web/src/services/commercial-billing-reminder-scheduler.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/page.tsx`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/commercial-admin-dashboard.tsx`
- 関連テスト
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/OEM_SETUP_FEE_PAYMENT_COMMUNICATION_IMPLEMENTATION.md`

## 3. 主要な設計判断

- 請求表示名はブラウザー入力ではなく、DBの`TenantInvoice.kind`からサーバー側で決定する。
- `MONTHLY_USAGE`は`OEM月額利用料`、`SETUP_FEE`は`OEM初期費用`とし、未知の種別を月額と推測しない。
- Stripe Adapterは上位で決定した表示名を送信するだけとし、金額、請求ID、Workspace、冪等キーの照合を変更しない。
- 手動督促と日次自動督促の両方を同じ種別表示にする。
- 初期費用の作成成功と安全条件不足を管理画面で明示する。

## 4. 実行した検証

- 対象Web tests: PASS（5 files / 30 tests）
- Web全体tests: PASS（471 files / 3314 tests、2 files / 2 tests skipped）
- Web typecheck: PASS
- Web lint: PASS（0 errors。既存ファイルに未使用`eslint-disable`警告1件）
- Web production build: PASS（Next.js、static pages 35/35）
- Architecture boundary tests: PASS（10 tests）
- Prettier / `git diff --check`: PASS
- GitHub CIはPR提出後に確認する。

## 5. 未解決事項

- 本番Stripeで初期費用のCheckout、自動回収、Webhook消込を実行していない。
- 本番請求先へ初期費用の手動・自動督促メールを送信していない。
- 初期費用の返金、部分返金、取消会計は本作業の対象外。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. production基点の限定releaseを別途レビューする。
3. 実の初期費用請求発行、Stripe決済、督促送信はそれぞれ明示承認を得る。
