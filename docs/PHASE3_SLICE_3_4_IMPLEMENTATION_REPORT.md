# Phase 3 Slice 3.4 Daily Mission Core Persistence 実装報告

## 結果

DailyMissionとMissionContentの必須1対1aggregate、format別validation、tenant/relation境界、通常Missionの日付一意性、状態遷移をSOCIAL Core Persistenceへ実装した。

## 実装内容

- DailyMission / MissionContent domain型とrepository port
- Create / List / Get / Transition use case
- SLIDE / LIVE_ACTION / AI_VIDEO_PROMPT / IMAGEのstrict validation
- MissionとContentを同一transactionで作成
- `workspaceId + bunshinId + missionDate`のDB一意制約
- Bunshin、Social Profile、Weekly Plan Itemへの複合FK
- GENERATED / VIEWED / STARTED / COMPLETED / SKIPPED / EXPIRED状態機械
- terminal状態のimmutable化と同一状態操作の冪等化
- SOCIAL Assignment mutation guardと停止中read

## 検証

- Prisma schema validate: 成功
- 空PostgreSQLへ全9 migration適用: 成功
- capability-social unit: 4 files / 24件成功
- database integration: 14件成功
- capability-social typecheck: 成功
- database typecheck: 成功
- 変更対象へPrettier適用

## Rollback

Production適用前にbackup/restoreを確認する。rollback順序は、`mission_contents`、`daily_missions`を削除し、追加したSocial Profile / Weekly Plan Itemの複合unique index、最後に`DailyMissionStatus` enumを削除する。既存migration履歴は書き換えず、必要時はforward migrationとして作成する。

## 対象外の維持

HTTP API、UI、AI、Prompt管理、generation log、Feedback、PostRecord、scheduler、自動expire、LINE、Job、Provider、SNS投稿、embedding、BLOGは実装していない。
