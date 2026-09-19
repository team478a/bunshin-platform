# OEM決済Webhook再処理 実装レポート

日付: 2026-09-19

## 1. 調査した内容

- 運営団体別Stripe設定、署名検証、Checkout完了・期限切れ・返金Webhookの処理経路
- `PaymentWebhookEvent`の保存内容と失敗通知の運営画面
- 購入、Enrollment、返金処理の冪等性とWorkspace境界
- 秘密情報、Webhook本文、監査履歴の保存方針

## 2. 変更したファイル

- Stripe Event取得: `apps/web/src/payments/secure-configuration.ts`
- 共通Webhook dispatcher: `apps/web/src/payments/stripe-program-event.ts`
- 再処理Service: `apps/web/src/payments/payment-webhook-recovery.ts`
- Webhook endpoint: `apps/web/src/http/program-checkout.ts`
- 運営団体決済画面: `apps/web/app/(app)/organizations/[workspaceId]/payment/page.tsx`
- 境界、Provider、再処理のテスト

## 3. 主要な設計判断

- Webhook本文は保存しない。FAILED台帳のStripe Event IDを、運営団体自身の秘密鍵でStripe APIから再取得する。
- 再処理対象は、選択Workspace、現在環境、Stripe、ACTIVEまたはDISABLED設定、FAILED状態をすべて満たすイベントだけに限定する。
- Stripeから再取得したEvent IDが台帳と一致しない場合は処理しない。
- 初回受信と再処理は同じdispatcherを利用し、購入・Enrollment・返金の既存冪等処理を維持する。
- 運営者は3〜500文字の理由を必須入力し、要求・成功・失敗を既存の決済設定監査履歴へ追記する。
- Providerのエラー本文や資格情報は画面・監査履歴へ保存しない。

## 4. 実行した検証

- Web TypeScript typecheck
- 変更ファイルのESLint
- Stripe Event取得、Workspace境界、Event ID照合、監査、既存決済ライフサイクルの単体テスト
- Prisma Client生成後の型解決

## 5. 未解決事項

- Stripe側から削除・取得不能になったEventは自動復元できない。Stripe取引と内部購入台帳を運営者が照合する必要がある。
- 購入対象や金額が一致しない`PURCHASE_MISMATCH`は、原因を直さず再処理しても成功しない。
- 本番Stripe Test Modeで意図的に失敗させ、設定修正後の再処理を確認する実運用試験が必要。

## 6. 次Phaseへ進める条件

- PRのCI成功とレビュー・マージ。
- 対象運営団体のStripe接続とWebhookイベント設定が完了していること。
- Test ModeでCheckout完了、期限切れ、返金の各失敗を1件ずつ再処理し、購入・Enrollment・監査履歴を確認すること。
