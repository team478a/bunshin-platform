# OEM月額利用料 Stripe Checkout実装報告

## 1. 目的

確定MAUから作成したOEM月次請求を、ワタシワークス販売主体のStripe Hosted Checkoutで支払えるようにし、入金結果を内部請求台帳へ自動反映する。

## 2. 実装内容

- `EXTERNAL_BILLING`契約の`ISSUED`請求に「Stripeで支払う」を表示
- 団体OWNER/ADMINだけが自団体の請求Checkoutを開始可能
- 金額、請求番号、請求先メールをサーバー側の`TenantInvoice`と契約から確定
- Checkout Session ID、有効期限、Payment Intent、失敗状態を請求台帳へ保存
- 署名済み`checkout.session.completed`で請求を`PAID`へ自動更新
- `checkout.session.expired`後は新しいCheckoutを開始可能
- Event IDを専用台帳で重複排除し、Workspace、Session、金額、通貨、実行環境を照合
- Stripe Webhook本文とカード情報は保存しない

## 3. 決済境界

このStripeはワタシワークスがOEM事業者から月額利用料を受け取る基盤側接続である。OEM各社がProgram購入者から売上を受け取る`OrganizationPaymentConfiguration`とは秘密鍵、Webhook、台帳を共有しない。

## 4. 本番設定

Vercel Productionへ次をserver-onlyで登録する。

- `PLATFORM_BILLING_STRIPE_SECRET_KEY`
- `PLATFORM_BILLING_STRIPE_WEBHOOK_SECRET`

Stripe Webhook URL:

`https://www.watashi-works.com/api/payments/stripe/platform-billing/webhook`

登録イベント:

- `checkout.session.completed`
- `checkout.session.expired`

## 5. 今回の対象外

- 保存カードによる毎月の無操作自動課金
- 請求メールと支払期限超過の自動督促
- 消費税計算、適格請求書、返金
- 複数通貨とStripe以外のProvider

Hosted CheckoutとWebhook入金消込の実運用確認後、保存支払方法を使う自動回収を別作業単位で追加する。
