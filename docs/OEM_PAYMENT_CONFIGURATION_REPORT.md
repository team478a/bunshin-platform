# OEM運営団体別 決済接続設定 実装報告

## 1. 調査した内容

- OEM契約・MAU・内部請求台帳と、`ProgramOffering.paymentOwner`の責任境界
- `Workspace(type=ORGANIZATION)`、`WorkspaceMembership(OWNER / ADMIN)`による団体管理権限
- LINE・AI・管理者メール設定で利用中のAES-256-GCM暗号化、接続確認、監査履歴
- Stripeの支払いを発生させずに接続先アカウントを確認する`GET /v1/account`

## 2. 変更したファイル

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260918200000_add_oem_payment_configurations/migration.sql`
- `packages/database/src/schema-readiness.ts`
- `packages/config/src/index.ts`
- `apps/web/src/payments/secure-configuration.ts`
- `apps/web/app/(app)/organizations/[workspaceId]/payment/page.tsx`
- `apps/web/app/(app)/organizations/[workspaceId]/manage/page.tsx`
- `apps/web/test/payment-secure-configuration.test.ts`
- `apps/web/test/organization-payment-page.test.ts`
- `docs/DECISION_LOG.md`

## 3. 主要な設計判断

- 決済接続はサービス単位ではなくOEM運営団体のWorkspace単位で保持する。
- 契約・利用量・内部請求はProvider非依存のまま維持し、Stripe固有情報を外部連携境界へ置く。
- 秘密鍵とWebhook署名シークレットを用途分離したAES-GCMで暗号化し、画面・監査ログへ平文を出さない。
- 保存後は停止中の下書きとし、Stripe接続確認に成功した設定だけを有効化できる。
- 団体の`OWNER / ADMIN`とPlatform Admin以外は設定画面を参照・更新できない。

## 4. 実行した検証

- Prisma schema validation
- Database test: 106 files / 339 tests
- Web test: 251 files / 1,167 tests
- Web lint
- Web TypeScript typecheck
- Next.js production build
- 暗号化改ざん検知、Stripe接続確認、Workspace権限境界の追加テスト

## 5. 未解決事項

- Checkout Session作成とProgram Offeringの購入画面
- Workspace設定を解決する決済Runtime
- Workspace別Webhook endpoint、署名検証、冪等な決済イベント保存
- 入金成功からEntitlement / Program Enrollmentを開始する処理
- 返金・取消・チャージバック時の利用権更新
- Stripe上の商品・Price IDとProgram Offeringの対応付け

## 6. 次Phaseへ進める条件

- 各OEMがStripeアカウントと販売主体として必要な表記を準備する。
- 商品価格、返金条件、提供期間、購入者へ表示する利用規約を確定する。
- 次PhaseでWebhook URLを発行後、Stripe管理画面でWebhook署名シークレットを作成して本設定へ登録する。
- テストモードでCheckoutから入金Webhook、利用権開始までを通し、運営者が確認してから本番へ切り替える。
