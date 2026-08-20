# Phase 3 Slice 3.7-A PostRecord / Feedback Core Persistence 実装報告

## 1. 調査した内容

- FREE SOCIAL MVPの手動投稿完了、本人らしさFeedback、Preference / Outcome分離
- DailyMission、MissionDecision、MissionActivityのtenant・transaction・idempotency境界
- Social Capability停止時はreadを許可し、mutationを拒否する既存方針

## 2. 変更した内容

- PostRecord、PostSource、MissionFeedback、MissionFeedbackRatingを追加
- POSTED、FEEDBACK_GOOD、FEEDBACK_NEUTRAL、FEEDBACK_BAD Activityを追加
- MissionOutcomeRepositoryと取得・保存use caseを追加
- Prisma repository、schema、migrationを追加
- use case testとdatabase integration testを追加

## 3. 主要な設計判断

- PostRecordは1 Mission 1件とし、ACCEPTED済みMissionだけ投稿完了を許可する
- PostRecordとPOSTED Activityを同一transactionで保存する
- DailyMission COMPLETEDへの暗黙遷移は行わない
- FeedbackはPostRecord作成後だけ許可し、現在値は1件、変更履歴はActivityへappendする
- FREEではsourceをMANUALに固定し、externalPostIdとmanualMetricsはCoreから設定しない
- SocialProfile付きMissionではPostRecordのplatform一致を要求する

## 4. Isolation / Idempotency

- Workspace、Bunshin、verified actorを全queryへ含める
- 別User / Workspace / Bunshinのread・mutationを拒否する
- archive済みBunshin、inactive membership、管理権限なしのmutationを拒否する
- SOCIAL SUSPENDED / LOCKEDではmutationを拒否し、履歴readは維持する
- PostRecordのMission一意性とActivity idempotency keyで重複計上を防止する
- Feedback再送は同じActivityを返し、評価変更は新しいActivityとして保存する

## 5. 対象外

- authenticated API / UI
- SNS OAuth、自動投稿、外部Post ID取得、Analytics API、manual metrics入力
- AI、Knowledge、Memory自動学習、LINE、BLOG、Job

## 6. 次へ進む条件

- D-035、migration、transaction境界を人間レビューする
- 承認後にSlice 3.7-B authenticated API / UXを独立PRで開始する
