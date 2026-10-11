# OEM請求 Stripe返金要照合 実装報告

## 1. 調査した内容

- OEM向け内部請求台帳はStripe Checkout・自動回収の入金完了を扱うが、`charge.refunded`を処理していなかった。
- Stripe公式仕様では`charge.refunded`は部分返金でも発生し、Chargeの`payment_intent`、`amount`、累計`amount_refunded`、全額時だけtrueとなる`refunded`で照合できる。
- 内部請求には税務・会計上の返金確定、取消文書、部分返金残高の承認済み方針がなく、通知だけで請求状態を変更することはできない。
- 既存`CommercialBillingWebhookEvent`にProvider Event ID、請求、状態、payload digest、error categoryを保存できるため、schema追加なしで要照合の検知を残せる。

## 2. 変更したファイル

- `apps/web/src/payments/commercial-invoice-payment.ts`
- `apps/web/app/(app)/admin/commercial-billing/page.tsx`
- `packages/database/src/commercial-billing-service.ts`
- 関連テスト
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/OEM_INVOICE_REFUND_REVIEW_IMPLEMENTATION.md`

## 3. 主要な設計判断

- `charge.refunded`は署名検証後、環境、Charge ID、PaymentIntent、JPY、元金額、累計返金額、全額フラグを検証する。
- PaymentIntentに一致するStripe入金済み請求がちょうど1件の場合だけ受理する。0件・複数件・未入金・金額不一致はfail-closedとする。
- Provider Event IDを既存一意制約で冪等化し、payload本文やカード情報は保存しない。
- 部分返金は`PARTIAL_REFUND_REVIEW_REQUIRED`、全額返金は`FULL_REFUND_REVIEW_REQUIRED`として既存Webhook台帳へ保存する。
- `TenantInvoice.status`、入金日、金額、請求書Snapshotは変更せず、全体請求画面に要照合として表示する。

## 4. 実行した検証

- 対象Web tests: PASS（2 files / 16 tests）
- 対象Database tests: PASS（1 file / 13 tests）
- Web全体tests: PASS（471 files / 3319 tests、2 files / 2 tests skipped）
- Database全体tests: PASS（197 files / 960 tests）
- Web / Database typecheck: PASS
- Web / Database lint: PASS（0 errors。Webの既存ファイルに未使用`eslint-disable`警告1件）
- Web production build: PASS（Next.js、static pages 35/35）
- Architecture boundary tests: PASS（10 tests）
- Prettier / `git diff --check`: PASS

## 5. 未解決事項

- 返金の会計確定日、売上認識、部分返金後残高、取消文書、返金済み請求状態は未決定。
- 要照合表示の解消操作は未実装。承認済み方針なしに自動消去しない。
- 本番Stripe Webhookへの`charge.refunded`購読追加、実返金、既存返金データの照合は行っていない。
- Stripe Dashboardや会計帳簿の代替機能ではない。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. production基点の限定releaseを別途レビューする。
3. 本番Webhook購読変更と実返金はそれぞれ明示承認を得る。
4. 請求状態変更や要照合解消を実装する前に、部分／全額返金の会計・取消方針を承認する。
