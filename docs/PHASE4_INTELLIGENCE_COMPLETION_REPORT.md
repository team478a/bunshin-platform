# Phase 4 SOCIAL Free MVP Intelligence 完了レポート

## 目的

確定済みWeekly Planの当日Itemから、ユーザーが実行できるMission BriefとSNS形式別MissionContentを生成し、品質確認後に完全なDailyMission aggregateとして保存する。

## 実装範囲

- Daily Mission Planner、Content Generator、Quality CheckerのCore Port / Use Case
- OpenAI Responses API Adapter（strict JSON Schema、`store: false`）
- `TEXT / SLIDE / IMAGE / LIVE_ACTION / AI_VIDEO_PROMPT`の形式別生成とCore再検証
- verified session、same-origin、strict JSONの生成API
- Active SOCIAL、Active SocialProfile、承認済みStrategy、確定済みWeekly Plan、当日Item、Active Content Pillarの事前検証
- Bunshin contextとGrant済みOwnerKnowledgeだけを使う生成境界
- 品質合格後だけMission / MissionContent / PENDING MissionDecisionを既存transactionでatomic保存
- Stage 1のformat/platform決定検査と、Stage 2の`PASS / REVISE / REJECT` AI検査
- `REVISE`時のrepairInstructionによる最大1回の再生成
- DB claimによる同日並行生成・重複課金防止と失敗状態の記録
- model、Prompt Version、token、latency、成否の構造化ログ
- Bunshin編集画面の生成フォームと既存Daily Mission利用UXへの接続

## 保存と失敗時の扱い

PlannerとContent Generatorの途中結果は永続化しない。Provider障害、不正なstructured output、Quality Checkerの`REJECT`、repair後の再不合格、70点未満ではHTTP errorを返し、DailyMissionを作成しない。同一Workspace / Bunshin / local dateの重複はProvider呼び出し前のDB claimとDailyMission unique制約で防ぐ。

## Privacy / Isolation

認証済みactorからWorkspace / Bunshin scopeを決定する。クライアントから戦略本文、Knowledge、Bunshin context、保存先IDを受け取らない。Provider入力からWorkspace ID、Bunshin ID、SocialProfile ID、WeeklyPlan ID、WeeklyPlanItem IDを除外する。ログにはPrompt、生成本文、Knowledge、API keyを記録しない。

## 環境変数

- `OPENAI_API_KEY`: 必須、server-only
- `OPENAI_DAILY_MISSION_PLANNER_MODEL`: 任意、既定`gpt-5.2`
- `OPENAI_CONTENT_GENERATOR_MODEL`: 任意、既定`gpt-5.2`
- `OPENAI_MISSION_QUALITY_MODEL`: 任意、既定`gpt-5.2`
- `OPENAI_MISSION_CONTENT_MODEL`: 旧名称との移行互換用

## 検証

- Core: 全5形式、incomplete content拒否、trusted IDのProvider除外、品質点数境界
- Planner: Cross Workspace / Cross Bunshin / Profile / Strategy / Weekly Plan / PillarをProvider呼び出し前に拒否
- Provider Adapter: strict JSON Schema、`store: false`、usage/model/latency取得
- Persistence: 既存DB integrationでaggregate atomicity、日付一意性、tenant isolationを検証
- Migration: 空のPostgreSQL 16へ全14 migrationを適用し、DB integration 14件をスキップなしで検証
- Repository全体: typecheck、lint、unit test、buildを実行する

## 対象外

Job、LINE、SNS OAuth・自動投稿、画像・動画binary生成、Memory自動学習、BLOG、課金は実装しない。
