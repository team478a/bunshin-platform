# Phase 4 Slice 4.2 Daily Mission Planner 実装レポート

## 目的

確定済みWeekly Planの当日Itemを、ユーザーが今日実行できるMission Briefへ変換する。本Sliceでは投稿本文やスライド等を生成せず、PlannerとContent Generatorの責務を分離する。

## 実装範囲

- `DailyMissionPlannerPort`
- `GenerateDailyMissionBrief` use case
- OpenAI Responses API Adapter
- strict JSON Schemaによる`topic / angle / reason / estimatedMinutes`生成
- Prompt Version、model、token、latency、statusを後続orchestrationが記録できるresult
- Core validationとProvider Adapterのunit test

## ContextとIsolation

Planner入力は、対象Bunshin、承認済みAccount Strategy、確定済みWeekly Plan、当日のWeeklyPlanItem、Active Content Pillar、Grant済みOwnerKnowledgeに限定する。Workspace ID、Bunshin ID、Plan ID、Item IDはProvider payloadへ含めない。

Coreは以下をProvider呼び出し前に検証する。

- Weekly Planが`CONFIRMED`
- Planner timezoneとWeekly Plan timezoneが一致
- mission dateに対応するItemが存在
- Itemが参照するContent PillarがActive

`socialProfileId / weeklyPlanItemId / missionDate / format`はAIに生成させず、検証済みcontextからBriefへ付与する。

## 永続化を行わない理由

既存DailyMissionはMissionContent必須のaggregateである。Planner結果だけを保存すると不完全Missionになるため、本SliceでAPI/UIとDB保存は追加しない。Content GeneratorとQuality Checker完了後、orchestrationがBriefとMissionContentをまとめて既存のatomic createへ渡す。

## 環境変数

- `OPENAI_API_KEY`: server-only必須
- `OPENAI_DAILY_MISSION_PLANNER_MODEL`: 任意。既定値`gpt-5.2`

## 対象外

Content Generator、Quality Checker、DailyMission保存API/UI、scheduler/job、別案生成、画像/動画binary、SNS自動投稿、Memory学習、LINE、BLOGは実装しない。
