# Phase 4 Slice 4.1 Weekly Planner AI 実装レポート

## 実装範囲

Weekly Planner AIは、承認済みAccount Strategyを週次の実行可能なDRAFT Weekly Planへ変換する。使用する情報は対象Bunshin、Active SocialProfile、承認済み戦略、Active Content Pillar、Grant済みOwnerKnowledgeに限定した。

Coreに`WeeklyPlannerPort`、structured outputの検証use case、生成Planのatomic保存use caseを追加した。WebのOpenAI AdapterはResponses APIとstrict JSON Schemaを使用し、`store: false`で呼び出す。

## 生成と保存

- 週開始日は月曜日のlocal date
- Itemは1〜7件、指定週内、日付重複なし
- `contentPillarId`はProviderへ渡したActive Pillarのみ
- formatは既存の`TEXT | SLIDE | IMAGE | LIVE_ACTION | AI_VIDEO_PROMPT`
- PlanとItemは同一DB transactionで`DRAFT`保存
- 人間の確認を経ずに`CONFIRMED`へ変更しない

## API / UX

`POST /api/workspaces/{workspaceId}/bunshins/{bunshinId}/weekly-plans/generate`を追加した。入力は`weekStartDate`、`timezone`、`socialProfileId`だけであり、戦略、Pillar、Knowledge、actorはサーバーがverified sessionとscopeから取得する。Bunshin編集画面にAI DRAFT作成フォームを追加した。

## セキュリティとコスト制御

Provider呼び出し前にsame-origin、verified session、Active SOCIAL、同週Planの非存在、Active Profile、Active Pillar、承認済み戦略を検証する。また、成否ログはmodel、prompt version、tokens、latencyだけとし、本文、Knowledge、Prompt、API keyを保存しない。

## 環境変数

- `OPENAI_API_KEY`: server-only必須
- `OPENAI_WEEKLY_PLANNER_MODEL`: 任意。既定値`gpt-5.2`

## 対象外

Daily Mission生成、Content Generator、Quality Checker、画像/動画binary、SNS自動投稿、Memory学習、LINE、BLOG、Jobは実装しない。
