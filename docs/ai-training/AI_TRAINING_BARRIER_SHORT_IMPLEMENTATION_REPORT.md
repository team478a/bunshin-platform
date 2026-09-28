# AI研修 Barrier・1分版・Practice/Work 実装報告

- 実装日: 2026-09-28
- 対象: AI研修MVPの未実装差分（Barrier理由、1分版、Practice/Work表示）
- Decision: `D-124`

## 1. 調査した内容

- `AiTrainingV1Policy`、Mission Quality、個別化Rendererと後方互換Parser
- Enrollment / Assignment / Answer / EventのWorkspace・Service・User境界
- 受講者画面、同一Origin API、管理Dashboard、既存の冪等操作
- `variantKey` と `displaySnapshot` によるMigration不要のVariant表現

## 2. 実装内容

- 6種類のBarrier理由と決定的な調整Policy
- 学習目的を維持し、成功条件・評価条件を1項目に絞る1分版
- 回答前に通常版へ復元できるSnapshot
- Foundation中はPractice、Foundation後かつ実務利用実績がある場合はWorkとする表示判定
- Barrier記録API、同一Origin検証、入力Validation、冪等なSerializable Transaction
- Active Participant / Enrollment / Assignmentの再検証と、回答提出後の変更拒否
- 受講者画面の理由選択、通常版復元、目標見直し導線
- 管理DashboardのBarrier件数、1分版調整件数、目標見直し案内件数

## 3. 主要な設計判断

- Barrier Eventには選択値と調整結果だけを保存し、回答や自由記述を保存しない。
- 1分版を別MissionにせずAssignment Variantにすることで、同じ学習目的と履歴を維持する。
- AI Providerは分岐に使わず、障害時にも同じ入力から同じ結果を得られるようにする。
- 既存Snapshot schema 1〜4は読み取り可能なまま維持し、新規Assignmentはschema 5を使う。

## 4. 検証

- Capability unit test: Barrier分岐、1分版、学習目的維持、通常版復元、Practice/Work前提
- Database boundary test: Workspace / Service / User / Enrollment / Assignment境界、回答後拒否、冪等性、自由記述非保存
- Web unit/static test: 受講者導線、同一Origin API、管理集計
- TypeScript typecheck: capability-training、database、web

## 5. 未解決事項

- Provider生成Scenarioの品質評価とFallback
- AI評価の非同期Job化、再試行、失敗回復UI
- 回答・評価・Toolkitの保持期間、削除、Export運用
- LINE実端末を含むProduction Pilot証跡

## 6. 次Phaseへ進める条件

- 本変更のレビューとCI成功
- 自社PilotでBarrier選択、1分版完了率、通常版復元、目標見直しの観測
- Provider生成へ進む前にPrompt Version、原価上限、Fallback、個人情報境界を確定する
