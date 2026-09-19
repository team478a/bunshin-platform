# 共通Program有料販売 実装レポート

日付: 2026-09-19

## 1. 調査した内容

- 既存のProgram、Offering、Enrollmentの責務と、一会員・一Programの一意制約
- 運営団体単位のStripe設定、Checkout、Webhook、返金・失効処理
- AI物販V1専用のDAY7購入経路と、共通Program販売へ再利用できる境界
- サービス単位の法務文書、参加者権限、Workspace / Groupのデータ分離

## 2. 変更したファイル

- Application: `packages/application/src/program-commerce.ts`
- Database: `packages/database/prisma/schema.prisma` と2件のmigration
- API: `apps/web/app/api/services/[serviceSlug]/program-products/**`、`program-offerings/**`
- Payment: `apps/web/src/payments/program-purchase.ts`、`apps/web/src/http/program-checkout.ts`
- Admin UI: `apps/web/app/s/[serviceSlug]/manage/programs/**`
- Participant UI: `apps/web/app/s/[serviceSlug]/programs/**`
- Legal UI: サービス法務管理、公開法務ページ、`/commerce`
- Tests: Application、Database、Webの境界テスト

## 3. 主要な設計判断

- AI物販専用Offerは維持し、共通商品を`productKind=PROGRAM_ACCESS`、`purchaseMode=DIRECT`で識別する。
- 価格、通貨、利用日数、提供内容、timezoneはversioned `ProgramOffering.termsSnapshot`へ保存し、ブラウザーから価格を受け取らない。
- 商品条件の変更は既存Offeringを上書きせず、旧版を`SUPERSEDED`にして新しい版を作る。
- 購入者、Workspace、Service Group、Membership、Program、決済設定をサーバー側で再解決する。
- Stripeの署名済みWebhookで入金を確認した後だけ、期間付きEnrollmentを作成する。
- Checkout開始には利用規約、プライバシーポリシー、特定商取引法に基づく表示の公開を必須とする。登録同意の対象は利用規約とプライバシーポリシーのままとする。
- Checkout後に商品を停止・改版しても、確認済み入金のEnrollmentは作成する。販売停止によって支払済み利用者の権利を失わせない。
- StripeがCheckoutを作れなかった場合は購入台帳を`FAILED`へ移し、利用者が再試行できない状態を残さない。
- 同じ会員が同じProgramを重複購入できないよう、Application判定とDBの部分一意indexを併用する。
- 決済から戻った画面には受付・中断状態を明示し、Webhook確認中の重複購入を画面とサーバーの両方で防ぐ。

## 4. 実行した検証

- Application typecheck
- Database typecheck / Prisma validate
- Web typecheck
- Program commerce、法務同意、DB migration readiness、直接Checkout、Webhook Enrollment作成のテスト
- `git diff --check`

## 5. 未解決事項

- Stripe本番鍵、Webhook URL、3つの法務文書本文は各運営団体が本番画面で設定・公開する必要がある。
- 一会員・一Programの現行制約により、同じProgramの更新購入は対象外。継続販売が必要な商品は別Programまたは将来の更新権設計が必要。
- 税務上の正式な請求書・領収書発行はStripe等の外部決済事業者の責務。

## 6. 次Phaseへ進める条件

- PRのCIが成功し、migrationを含めてレビュー・マージされること。
- 対象運営団体でStripe接続確認とWebhook登録を完了すること。
- サービス管理画面で3つの法務文書を公開してから商品を公開すること。
- Stripe test modeで購入、Webhook、Enrollment開始、返金時の権利状態を1件ずつ確認すること。
