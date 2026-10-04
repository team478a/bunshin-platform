# SOCIAL Decision Repair Guard

## 状態

2026-10-04 JST。PR #1113のmain反映（merge commit `5f423f745c416db9716f0ee2dd4dae6786673d2d`）を確認後、そのmainから開始した。Decision Context対象のDaily Missionで、reBriefなしの本文repairが旧personalization reasonと異なる企画を保存しないためのfail-closed guardを追加する。

新しいAgent、Memory、Analytics、テーブル、migration、UI、課金、画像・動画生成、SNS自動投稿は追加しない。merge、本番deploy、実課金API、実AIは実施しない。

## 1. 調査した内容

- Brief生成後の本文品質pipelineは、REVISE時に同じBriefを使って本文だけを最大2回repairする。
- 直近本文との意味重複時は、疑問、具体情報、利用場面、読者価値を別企画へ変えるvariant retryを行う。
- repair後も品質checkerはBriefとの整合を再検査するが、意味変更の機械判定や新しいBrief reason、decision revisionは生成しない。
- Missionのtopic、angle、reasonとSnapshotのpersonalization reasonはBrief由来であり、repair本文由来ではない。

## 2. 変更したファイル

- `apps/web/src/services/daily-mission-quality-pipeline.ts`: reBrief必須policyでは本文repairまたはvariant retry前にfail-closed。
- `apps/web/src/services/daily-mission-generation.ts`: READY Decision Context対象だけreBrief必須policyを指定。
- 対応するwebテスト、Decision Log、既存Hassy文書、本書を更新。

## 3. 主要な設計判断

- 意味変更を推測する新しいAI判定は追加しない。reBrief／revision正本がない間は、Decision Context対象のREVISEと、既存本文検査が検出した重複・作成指示露出を保存前に停止する。
- 初回品質PASSかつ意味重複なしは従来どおり保存する。
- Decision Context対象外は既存のbounded repairを維持し、他Serviceへ挙動変更を広げない。
- エラーcauseへ `DECISION_REBRIEF_REQUIRED`、issue code、novelty issue、試行回数を残すが、生成本文や秘密情報は追加しない。

## 4. 実行した検証

- 対象web test: 品質REVISE、直近本文との完全重複、対象外の従来repair、runtime境界を含む7件成功。
- `pnpm architecture:check`: 成功。
- `pnpm test:architecture`: 10件成功。
- `pnpm typecheck`: 25/25 task成功。
- `pnpm lint`: 25/25 task成功。既存の `apps/web/app/consent/page.tsx:61` にunused eslint-disable warningが1件あるが、errorはない。
- `pnpm format:check`: 成功。
- `pnpm test`: 25/25 task成功。application 693件成功、web 2771件成功・live 2件skipを含む。
- `pnpm build`: Node 24.19.0で13/13 task成功。
- `git diff --check`: 成功。

実AI、実DB接続、Storage、通知、課金、本番deployは使用しない。

## 5. 未解決事項

- repair後の次動作と `REVISED_BRIEF` stageは、後続の `HASSY_DECISION_REBRIEF_CONTRACT.md` でpure contractとして固定する。自動reBriefと永続化するdecision revisionのどちらを正本にするかは引き続き未解決。
- reBrief時のProvider利用回数、quota、Usage、idempotency、最大試行数。
- 表記だけの安全な修正を同decisionで許可する場合の、Provider出力に依存しない分類契約。

## 6. 次Phaseへ進める条件

1. 本PRの人間レビューとCI成功を確認する。自動mergeしない。
2. 合成fixtureでBriefと本文の意味差を定義し、reBrief／revisionの入力・出力・失敗状態を合意する。
3. 自動reBrief、UI、Photo First、別案へ進む場合は本PRへ混ぜず独立した小PRにする。

## 停止・切り戻し

Decision Context対象へ渡すrepair policyとpipelineのguardをrevertすれば従来のbounded repairへ戻る。DB migrationや保存済みSnapshotの切り戻しは発生しない。
