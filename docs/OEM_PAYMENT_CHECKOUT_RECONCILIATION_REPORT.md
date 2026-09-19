# OEM決済Checkout照合 実装レポート

日付: 2026-09-19

## 1. 調査した内容

- Webhook未着時に`CHECKOUT_OPEN`のまま残る購入台帳と運営画面
- Stripe Checkout Sessionの取得APIと、運営団体別の暗号化資格情報
- 入金確定、期限切れ、Enrollment開始の既存Webhook dispatcher
- Workspace境界、冪等性、監査履歴

## 2. 変更したファイル

- Checkout取得Adapter: `apps/web/src/payments/secure-configuration.ts`
- 照合Service: `apps/web/src/payments/payment-checkout-reconciliation.ts`
- 運営団体決済画面: `apps/web/app/(app)/organizations/[workspaceId]/payment/page.tsx`
- Workspace境界、Provider取得、画面操作のテスト

## 3. 主要な設計判断

- 照合対象は、選択Workspace、現在環境、Stripe設定、`CHECKOUT_OPEN`状態、保存済みCheckout Session IDをすべて満たす購入だけとする。
- 運営団体自身のStripe秘密鍵でCheckout Sessionを取得し、Session IDと`metadata.purchase_id`を内部台帳と照合する。
- Stripeが`paid`なら既存のCheckout完了処理、`expired`なら既存の期限切れ処理へ渡す。未払い・受付中なら内部状態を変更しない。
- 照合用の決済Event IDとcanonical digestを生成し、既存の購入・Enrollment・Webhook台帳の冪等性を再利用する。後から本来のWebhookが届いても二重付与しない。
- 運営者は3〜500文字の理由を必須入力し、要求・成功・変化なし・失敗を決済設定監査へ追記する。
- Stripe応答本文、資格情報、Providerエラー本文はDBや画面へ保存しない。

## 4. 実行した検証

- Web TypeScript typecheck
- 変更ファイルのESLint
- Checkout取得、Workspace境界、購入ID照合、入金・未払い・監査の単体テスト
- 既存の購入確定・返金・Webhook再処理との回帰テスト

## 5. 未解決事項

- Stripe側で取得不能なCheckout Sessionは自動復旧できない。
- `CREATED`のままCheckout Session作成前に停止した購入はStripeに照合対象がなく、既存の再申込み経路で対応する。
- 本番Stripe Test ModeでWebhookを意図的に停止し、入金後の手動照合と遅延Webhook受信時の冪等性を確認する必要がある。

## 6. 次Phaseへ進める条件

- PRのCI成功とレビュー・マージ。
- Test ModeでWebhook未着の支払い済みCheckoutと期限切れCheckoutを各1件照合する。
- 遅延Webhookを再送し、Enrollmentや購入Eventが重複しないことを運営画面で確認する。
