# AI物販V1 DAY7 Offer LINE・ファネル実装報告

## 1. 調査した内容

- AI物販のAction通知が利用するサービス別LINE配信、Job、送達履歴
- DAY7分類、Offer表示・辞退・申込み、有料Enrollmentのイベント
- サービス管理画面のProgram管理と外部入金確認

## 2. 変更したファイル

- `packages/capability-resale/src/line-offer.ts`
- `apps/web/src/services/ai-resale-offer-line-scheduler.ts`
- `apps/web/src/jobs/service-line-broadcast-job-handler.ts`
- `apps/web/src/http/mission-scheduler.ts`
- `apps/web/app/s/[serviceSlug]/manage/programs/*`
- 関連テスト、スタイル、Decision Log

## 3. 主要な設計判断

- 新しい通知テーブルは作らず、既存の`ServiceLineBroadcast`、Recipient、Jobを再利用する。
- `DAY7_CLASSIFIED`済みでOffer未処理の参加者だけを候補にする。
- LINE接続、通知同意、友だち状態、サービスの共有／専用LINEルーティングを満たす場合だけ予約する。
- 送信直前にも現在のOffer状態を確認し、辞退・申込み・有料開始後の古い案内を送らない。
- ファネルは既存イベント、進捗スナップショット、LINE送達履歴から集計し、重複データを持たない。

## 4. 実行した検証

- capability-resaleのOffer通知文テスト
- Web境界テスト
- typecheck / lint / test / build

## 5. 未解決事項

- Stripe Checkout/Webhookによる自動入金確認
- LINE通知文と配信時刻をサービス管理者が変更する設定

## 6. 次Phaseへ進める条件

- PRのCI成功とレビュー完了
- 本番でAI物販Offer、LINE接続、Cron/Workerが有効であること
