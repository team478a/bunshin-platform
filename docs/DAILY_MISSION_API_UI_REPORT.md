# Daily Mission API/UI 実装レポート

## 目的

既存のDailyMission / MissionContent Core Persistenceをverified sessionへ接続し、Bunshin詳細で「今日やること」の内容とlifecycleを確認・更新できる最小API/UIを提供する。

## 実装範囲

- Bunshin scopeのMission list / detail API
- 後続AI Generatorが利用できるMission create API
- VIEWED / STARTED / COMPLETED / SKIPPED / EXPIREDの明示遷移API
- Bunshin詳細内のMission一覧、format別内容表示
- 内容を見る、開始、完了、今日は見送る操作
- verified session、same-origin、strict JSON、no-store、UUID validation
- Workspace / User / Bunshin / SOCIAL Capability境界の継承

create APIを画面へ公開する手動作成フォームは追加しない。Mission生成は後続のDaily Mission AI Generatorが同じCore use caseを経由して行う。

## API

```text
GET  /api/workspaces/:workspaceId/bunshins/:bunshinId/daily-missions
POST /api/workspaces/:workspaceId/bunshins/:bunshinId/daily-missions
GET  /api/workspaces/:workspaceId/bunshins/:bunshinId/daily-missions/:dailyMissionId
POST /api/workspaces/:workspaceId/bunshins/:bunshinId/daily-missions/:dailyMissionId/:action
```

actionは`viewed | started | completed | skipped | expired`だけを許可する。遷移規則、冪等性、terminal状態は既存Core/Repositoryを正本とする。

## UX境界

Mission lifecycleは作業の進行状態だけを表す。採用/不採用、Copy、投稿完了、Feedbackは別resourceであり、本PRではボタン・イベント・永続化を追加しない。

format別に次を表示する。

- TEXT: 本文、thread、CTA
- SLIDE: 各slideのheadline/body
- IMAGE: 制作指示、overlay、caption
- LIVE_ACTION: 撮影指示、script
- AI_VIDEO_PROMPT: 外部動画AI向けPrompt、caption

Copy操作はMissionActivity設計後に追加する。

## Isolationと権限

- readはactive Workspace Memberかつ対象Bunshinへアクセス可能なUserだけ
- mutationは既存Bunshin管理policyとACTIVE SOCIAL Assignmentが必要
- Assignment停止中もreadは許可する
- cross-workspace / cross-user / cross-bunshin / archived Bunshinは404
- actorUserId、status、timestamp等のauthority fieldをrequest bodyから受け取らない

## 対象外

- AI Mission Planner / Content Generator / Quality Checker
- Account Strategy生成の変更
- Mission Decision / Activity / Copy
- PostRecord / Feedback / Memory学習
- regenerate、scheduler、notification、LINE、Job
- SNS OAuth、自動投稿、画像・動画binary生成

## 検証項目

- 認証済みscope、cross-scope拒否、no-store DTO
- strict body、UUID、local date range、authority field拒否
- ACTIVE / MISSING / SUSPENDED / LOCKED境界
- lifecycle actionと既存Core状態遷移
- duplicate conflict、same-origin
- typecheck、lint、test、production build
