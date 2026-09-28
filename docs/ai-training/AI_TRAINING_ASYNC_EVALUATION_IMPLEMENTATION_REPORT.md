# AI研修 非同期評価・再試行 実装報告

- 実装日: 2026-09-28
- 対象: 回答評価の非同期Job化、再試行、失敗回復UI
- Decision: `D-125`

## 1. 調査した内容

- 同期評価APIとOpenAI評価Provider
- 共通JobのLease、指数バックオフ、最大試行、DEAD状態
- AI Usage、Organization / Service生成枠、Program進捗更新
- 受講者画面の回答保存、評価再開、結果表示

## 2. 実装内容

- `TRAINING_ANSWER_EVALUATE` Jobと専用Executor
- 回答保存直後の冪等Job投入
- Worker実行時のWorkspace / Service / Participant / Enrollment / Program / Answer再検証
- 最大3回のProvider再試行と、最終失敗時のAnswer `FAILED` 更新
- Provider試行単位のAI Usage記録と生成枠予約
- 評価、Mission、Profile、Progress、監査Eventのtransactional更新
- 評価状態GET API、30秒の画面ポーリング、画面を閉じても継続する案内
- `FAILED` 回答の明示的な再投入導線

## 3. 主要な設計判断

- Job payloadはWorkspace以外にService、Enrollment、Answer、ActorのIDだけを持ち、回答本文を複製しない。
- Job投入は回答保存API自身が行い、画面の評価APIは冪等な回復経路としても機能する。
- Provider成功後の状態更新は単一transactionとし、不完全なMission完了やSkill更新を残さない。
- Provider試行の生成枠・Usage keyはJob IDとattemptで分離し、再試行の利用量を監査可能にする。
- DB schemaは既存のJobとTrainingAnswer状態を利用するためMigration不要。

## 4. 検証

- Application unit test: 正常完了、再試行、DEAD後のFAILED更新
- Web boundary test: スコープ再検証、回答非複製、Worker接続、AI Usage、transaction
- Participant UI test: 非同期確認、PENDING案内、FAILED再投入
- typecheck / lint / test / build

## 5. 未解決事項

- Provider生成Scenarioと固定Fallbackの品質評価
- 回答・評価・Toolkitの保持期間、削除、Export運用
- Production Workerでの実Provider再試行・原価・遅延証跡

## 6. 次Phaseへ進める条件

- 本変更のレビューとCI成功
- 自社PilotでPENDING時間、再試行率、FAILED率、再投入成功率を観測する
- Privacy lifecycle実装前に保持期間と削除対象を確定する
