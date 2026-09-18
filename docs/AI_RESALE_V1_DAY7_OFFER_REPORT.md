# AI物販V1 DAY7 Offerと90日利用権 実装報告

## 1. 調査した内容

- DAY7分類を保存する無料Enrollment、Progress Snapshot、Program Action Event
- `PAID_90D`を実行できる既存Program Runtime
- Program Offering、Enrollment Snapshot、監査ログによる料金・利用期間の保持
- 外部決済を前提にしたpilot運用と、管理者による手動Enrollmentの既存境界
- 90日終了後のEnrollment、現在Action、Progressの扱い

## 2. 変更したファイル

- `packages/capability-resale/src/offer.ts`
- `packages/capability-resale/src/runtime.ts`
- `packages/database/src/resale-offer.ts`
- `packages/database/src/resale-runtime.ts`
- `apps/web/src/http/ai-resale-offer.ts`
- `apps/web/src/http/ai-resale-offer-admin.ts`
- 参加者向けOffer API、画面、Service管理画面
- 関連するexport、CSS、自動テスト、判断記録

## 3. 主要な設計判断

- DAY7分類後の案内は、無料Enrollmentに蓄積したEventとProgress Snapshotを正本にする。
- 標準とモニターの金額、90日、外部申込みURLは`ProgramOffering.termsSnapshot`から取得し、参加者画面へ固定値を埋め込まない。
- 標準Offerを「価格が高い」で辞退した場合だけモニターOfferを表示する。
- 参加者の申込み操作では有料Enrollmentを作らず、申込み意思を追記Eventとして保存する。
- 外部決済の入金を運営者が確認し、確認番号を入力した時だけ`PAID_90D` Enrollmentを作る。確認情報はEnrollment SnapshotとAuditに残す。
- 有料Enrollmentは開始から90暦日で終了し、共通Cronが`EXPIRED`へ更新して未完了Actionと次回評価を閉じる。
- Purchase、Payment、Webhookを装ったレコードは作らない。Stripe等の決済基盤は次の独立した作業単位とする。

## 4. 実行する検証

- Offer domain unit test: 料金Snapshot、状態別表示、価格辞退、申込み確認待ち
- Database boundary test: Tenant、Membership、無料・有料Policy、Event冪等性
- Web boundary test: 認証、same-origin、管理権限、外部決済と利用権の分離
- Runtime test: 90日終了時の利用権失効
- リポジトリ全体のlint、typecheck、test、build

## 5. 未解決事項

- Stripe等による実決済、決済Webhook、返金、キャンセル
- DAY7 Offerと有料開始のLINE通知
- 管理画面のFunnel集計と利用者単位Timeline表示
- 本番スマートフォンでの外部申込み画面往復と入金確認運用

## 6. 次の作業へ進める条件

- 本変更のCIが成功し、PRがレビュー・マージされること
- 次はDAY7 OfferのLINE通知と運営Funnel・Timelineを実装する
