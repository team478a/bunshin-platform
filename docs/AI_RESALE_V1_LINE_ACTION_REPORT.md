# AI物販V1 現在Action LINE通知 実装報告

## 1. 調査した内容

- 通常Daily MissionのLINE配信とService単位のLINE配信の責務、履歴、再送経路
- Serviceごとの専用LINEとワタシワークス共用LINEの振り分け
- 参加者本人の通知同意、友だち状態、Service Membershipの確認方法
- LINEからログインを経由して参加者本人の現在Actionへ戻る既存導線

## 2. 変更したファイル

- `packages/capability-resale/src/line-action.ts`
- `apps/web/src/services/ai-resale-action-line-scheduler.ts`
- `apps/web/src/jobs/service-line-broadcast-job-handler.ts`
- `apps/web/src/http/mission-scheduler.ts`
- 関連するexport、自動テスト、判断記録

## 3. 主要な設計判断

- Daily Mission通知へAI物販Assignmentを偽装せず、既存のService LINE Broadcastを再利用する。
- Assignment単位の`automationKey`で通知を一度だけ作り、既存Jobの履歴、最大3回の実行、運営者による再送を利用する。
- 専用LINEと共用LINEの現在設定を確認し、通知同意と友だち状態が有効な参加者本人だけを宛先にする。
- 通知時にもEnrollment、Membership、Program、現在Assignmentを再確認し、完了済みまたは更新済みのActionを送らない。
- 未接続時は通知を作成済みにせず、後からLINE接続が完了した時に現在Actionを通知できるようにする。
- URLはService slugとEnrollment IDから生成し、未ログイン時も既存ログイン画面が同じ参加者ページへ戻す。

## 4. 実行した検証

- Capability unit test: WORK、WAIT、RECOVERYの通知文と参加者URL
- Web boundary test: Tenant、Service、Membership、LINE接続、Assignment再確認、冪等Job
- リポジトリ全体の`lint`、`typecheck`、`test`、`build`

## 5. 未解決事項

- DAY7分類後の有料90日Program Offerと一括決済
- 本番LINE内ブラウザでの通知受信、ログイン復帰、Action結果保存の端末確認

## 6. 次の作業へ進める条件

- 本変更のCIが成功し、PRがレビュー・マージされること
- 次はDAY7の状態別Offer画面と90日利用権の付与境界を実装する
