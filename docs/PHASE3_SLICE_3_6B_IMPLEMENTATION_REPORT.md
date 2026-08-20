# Phase 3 Slice 3.6-B Mission Decision / Activity API・UX 実装報告

## 1. 調査した内容

- PR #43で承認されたMissionDecision必須1対1、MissionActivity append-only、idempotency境界
- PR #42のDailyMission authenticated API、lifecycle、format別表示
- Social Capability停止時はreadを許可し、mutationを拒否する既存方針

## 2. 変更した内容

- Decision取得・更新APIをDailyMission配下へ追加
- Activity一覧・追加APIをDailyMission配下へ追加
- verified session、same-origin、strict JSON validation、no-storeを適用
- 投稿案表示後に採用/不採用を提示し、不採用理由をワンタップで記録
- 採用後だけTEXT、SLIDE、AI_VIDEO_PROMPT、LIVE_ACTION、IMAGEの利用可能なコピー操作を表示
- Clipboard成功後だけCOPY Activityを保存
- 内容表示時にVIEWED Activityを保存

## 3. 主要な設計判断

- Mission lifecycleと採用判断は別resourceのまま維持した
- UIからworkspace、bunshin、actor等の権限情報を受け取らない
- COPY Activityに本文を保存せず、SLIDEは1〜7のslideIndexだけを許可した
- IMAGE専用Activityは先回りして追加せず、captionコピーだけを`COPIED_TEXT`として扱う
- PostRecordとFeedbackはSlice 3.7へ分離した

## 4. Isolation Test

- 未認証アクセスを拒否する
- 別Workspace/BunshinのDecision・Activityを404として扱う
- suspended CapabilityではDecision・Activity mutationを拒否する
- authority fieldと未許可metadataをstrict validationで拒否する

## 5. 対象外

- PostRecord、Feedback、別案生成、AI Mission生成
- SNS OAuth、自動投稿、Analytics、画像・動画生成
- Knowledge、Memory学習、LINE、BLOG、Job

## 6. 次へ進む条件

- D-034とAPI/UXを人間レビューし、本PRを承認する
- 承認後にSlice 3.7 PostRecord / Feedbackを独立PRで開始する
