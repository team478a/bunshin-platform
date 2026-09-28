# AI研修 評価運用可視化 実装報告

- 実装日: 2026-09-28
- 対象: 非同期回答評価のPilot運用指標
- Decision: `D-126`

## 1. 調査した内容

- AI研修管理ダッシュボードのService / Enrollment境界
- `TRAINING_ANSWER_EVALUATE` Jobの状態、試行回数、完了時刻、再投入識別子
- `TrainingMissionAnswer` の評価状態
- 非同期評価実装報告で未解決だったPilot観測項目

## 2. 変更した内容

- 直近7日間の評価依頼、成功、最終失敗、成功率
- 再試行が発生したJob数と、最終失敗後に本人が再投入したJob数
- 成功した評価の平均完了時間
- 現在処理中のJob数と最古の待機時間
- `PENDING` / `FAILED` 回答数
- Service管理画面の「AI評価の稼働状況」セクション

## 3. 主要な設計判断

- 回答本文、評価本文、参加者別の失敗情報は取得せず、集計値だけを表示する。
- JobはWorkspaceとService IDを含むpayload prefixで限定し、回答状態はWorkspace / Service / Enrollmentで限定する。
- まだ実測値がないため、自動警報の固定閾値は設定しない。
- 既存JobとAnswer状態を利用するためMigrationは追加しない。

## 4. 実行した検証

- 集計Unit test
- 管理画面のService境界・本文非取得Boundary test
- typecheck / lint / test / build

## 5. 未解決事項

- Pilot実測値に基づく警報閾値
- Slack / LINE / Email等の運用通知経路
- Provider別・Prompt Version別の原価と遅延比較
- 回答・評価・Toolkitの保持期間、削除、Export運用

## 6. 次Phaseへ進める条件

- 本変更のレビューとCI成功
- 自社Pilotで成功率、再試行率、完了時間、滞留時間を観測する
- 通知を追加する場合は、閾値と通知先の責任者を決定する
