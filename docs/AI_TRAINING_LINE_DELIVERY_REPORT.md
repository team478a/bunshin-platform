# AI研修 LINE通知 実装レポート

## 1. 調査した内容

- AI物販の現在Action通知、サービスLINE一斉配信、Job Workerの既存経路
- 共通LINEとサービス専用LINEの接続・同意・友だち状態の判定
- AI研修のProgram Runtime、現在Assignment、WAIT、RECOVERYの更新条件
- 認証前後で参加者画面へ戻る既存のURL処理

## 2. 変更したファイル

- `packages/capability-training/src/line-action.ts`
- `packages/capability-training/src/index.ts`
- `packages/capability-training/test/line-action.test.ts`
- `apps/web/src/services/ai-training-action-line-scheduler.ts`
- `apps/web/src/http/mission-scheduler.ts`
- `apps/web/src/jobs/service-line-broadcast-job-handler.ts`
- `apps/web/test/ai-training-action-line-boundary.test.ts`

## 3. 主要な設計判断

- 既存のMission Scheduler、ServiceLineBroadcast、Job Workerを再利用した。
- 通知準備時にTraining Policyで受講者の現在状態を再評価し、最新の個別課題をAssignmentとして確定する。
- Assignment IDをautomation keyへ含め、同じ課題の通知を重複作成しない。
- 配信直前にEnrollment、現在Assignment、Assignment status、Program moduleを再確認する。
- 共通LINEとサービス専用LINEの既存ルーティング設定を尊重し、通知同意と友だち状態が有効な本人だけを宛先にする。
- LINE本文には課題全文や回答内容を載せず、テーマ、選定理由、目安時間、参加者画面へのURLだけを載せる。
- WAITとRECOVERYは通常課題と文面を分け、利用者を責めない表現にした。

## 4. 実行した検証

- Training Capability test / typecheck / lint
- Web LINE boundary test / mission scheduler test
- Web typecheck / lint
- Repository全体のtest / typecheck / lint / build
- GitHub CI verify / database

## 5. 未解決事項

- LINE通知を管理画面からAI研修専用に停止・再開する設定
- 受講者が「後でやる」を選んだ場合の再通知時刻
- 「困った」の担当者通知と管理画面表示
- Pilot運用での通知時刻と頻度の最終決定

## 6. 次Phaseへ進める条件

- CI成功後、共通LINEとサービス専用LINEの両経路で1名ずつテスト配信する。
- Deep Linkからログインを経由して同じEnrollmentの課題画面へ戻れることを確認する。
- 同じAssignmentに対して複数回Schedulerを実行しても通知が1件であることを確認する。

次Phaseは法人管理画面へ受講者の進捗、現在テーマ、苦手領域、最終実施日を追加する。
