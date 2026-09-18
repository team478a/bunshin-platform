# OEM決済 返金額・差引売上 実装報告

## 1. 調査した内容

- Stripeの charge.refunded が返す累計返金額
- ProgramPurchase の購入金額、全額返金状態、Webhook冪等処理
- OEM事業者向け決済運用画面の売上集計

## 2. 変更したファイル

- packages/database/prisma/schema.prisma
- packages/database/prisma/migrations/20260918233000_add_program_purchase_refund_amount/migration.sql
- packages/database/src/schema-readiness.ts
- apps/web/src/payments/program-purchase.ts
- apps/web/src/payments/payment-operations.ts
- apps/web/app/(app)/organizations/[workspaceId]/payment/page.tsx
- 関連テスト

## 3. 主要な設計判断

- 購入ごとにStripeが通知する累計返金額を refundedAmountYen として保存する。
- 遅れて到着した古いWebhookで返金累計額が減らないよう、保存済み額との大きい方を採用する。
- 返金累計額は0円以上、購入金額以下にDB制約で限定する。
- 部分返金では有料利用権を維持し、全額返金時だけ利用権を取消する既存方針を維持する。
- 決済運用画面では「決済完了総額 − 返金総額」を差引売上として表示する。
- 集計と購入履歴は引き続き workspaceId で運営団体ごとに分離する。

## 4. 実行する検証

- Prisma schema validation・生成
- Database readiness・購入台帳テスト
- 部分返金、全額返金、Webhook到着順逆転の単体テスト
- Web TypeScript型検査
- lint・本番ビルド

## 5. 未解決事項

- Stripe手数料、入金手数料、税、チャージバックは差引売上に含めていない。
- 返金操作自体はStripe管理画面で行う。
- 会計帳簿や適格請求書の代替機能ではない。

## 6. 次Phaseへ進める条件

- migrationを本番環境へ適用する。
- Stripeテストモードで部分返金と全額返金を実行し、返金総額と差引売上を確認する。
