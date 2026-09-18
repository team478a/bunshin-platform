# OEM決済ライフサイクル実装報告

## 1. 調査した内容

- OEM運営団体ごとのStripe Checkout、Webhook署名検証、購入台帳
- Program Enrollmentの90日終了日時と利用判定
- StripeのCheckout期限切れ・全額返金イベント
- 既存の保護された定期処理とVercel Cron構成

## 2. 変更したファイル

- `apps/web/src/http/program-checkout.ts`
- `apps/web/src/payments/program-purchase.ts`
- `apps/web/src/http/program-payment-lifecycle.ts`
- `apps/web/app/api/internal/payments/expire-programs/route.ts`
- `apps/web/app/(app)/organizations/[workspaceId]/payment/page.tsx`
- `apps/web/vercel.json`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260918223000_add_program_purchase_lifecycle/migration.sql`
- 関連テスト、DB readiness

## 3. 主要な設計判断

- `checkout.session.expired` は未決済の購入だけを `EXPIRED` にする。
- `charge.refunded` は全額返金だけを自動取消対象とする。部分返金は利用権を止めず、Webhook台帳へ `PARTIAL_REFUND` として残す。
- 全額返金時は購入を `REFUNDED`、対応する有料Program Enrollmentを `CANCELLED` にする。
- 90日終了は、購入台帳と関連付いた有料Program Enrollmentだけを日次Cronで `EXPIRED` にする。
- Webhook処理は決済設定のWorkspace、Stripeモード、購入金額・通貨・Provider IDを照合する。
- 署名済みWebhookの処理失敗はトランザクション外で失敗台帳へ残す。

## 4. 実行した検証

- Prisma schema validation
- Web TypeScript typecheck
- 決済ライフサイクル単体テスト
- Webhook/Cron境界テスト
- DB schema・migrationテスト
- ESLint・Prettier・`git diff --check`

## 5. 未解決事項

- Stripe管理画面でWebhook送信イベントに `checkout.session.completed`、`checkout.session.expired`、`charge.refunded` を登録する必要がある。
- 部分返金の個別判断と返金操作自体はStripe管理画面で行う。
- 本番Stripe Test Modeを使った実決済・期限切れ・返金の運用確認が必要。

## 6. 次Phaseへ進める条件

- migration適用
- 各OEM運営団体のWebhookイベント設定更新
- Stripe Test Modeで購入、全額返金、利用停止まで確認
