# OEM Stripe Checkout 実装報告

## 調査した内容

- AI物販のDAY7オファー選択、外部手動決済、運営者による有料Enrollment作成経路
- 運営団体単位のStripe暗号化設定と権限境界
- ProgramOffering、ProgramEnrollment、ProgramActionEventの再利用範囲

## 変更した機能

- OEM運営団体の有効なStripe秘密鍵を使うCheckout Session作成
- Program購入台帳とWebhook処理台帳
- Stripe署名、時刻、環境、金額、通貨、団体、Offeringの照合
- `checkout.session.completed`による90日Programの自動開始
- 決済設定画面への団体固有Webhook URL表示
- Webhook署名シークレット未登録時の有効化禁止

## 主要な設計判断

- Stripe Connectは導入せず、各OEM事業者が登録したStripeアカウントへ直接入金する。
- 金額と購入対象はクライアント入力を信用せず、選択済みProgramOfferingから確定する。
- Webhook URLへ決済設定IDを含め、署名検証前に利用する秘密鍵を一意に特定する。
- Webhook本文は保存せずSHA-256 digestだけを監査用に残す。
- 購入とWebhookのモデルはAI物販固有名にせず、他Programでも再利用できる境界にする。

## 検証

- Stripe Checkout要求の金額・冪等キー
- Webhook署名の正常、本文改変、期限切れ
- 団体スコープ、購入照合、Webhook冪等境界
- Prisma schemaとmigration
- Web型検査

## 未解決事項

- Stripe本番アカウントでの実決済は、各OEM事業者がWebhookを登録した後に少額商品で確認する。
- 返金・キャンセル・失効の自動反映は次の決済運用ゴールで扱う。

## 次へ進める条件

1. DB migrationを本番へ適用する。
2. OEM運営団体ごとにStripe秘密鍵とWebhook署名シークレットを登録する。
3. 接続確認後に決済設定を有効化する。
4. Stripeテストモードで購入から90日Program開始まで確認する。
