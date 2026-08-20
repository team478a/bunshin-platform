# Phase 3 Slice 3.7-B PostRecord / Feedback API・UX 実装報告

## 1. 調査した内容

- PR #45のPostRecord / MissionFeedback Core Persistenceとtransaction境界
- PR #44の採用・不採用・コピーUXとDailyMission配下API
- verified session、same-origin、strict validation、no-storeの既存HTTP方針

## 2. 変更した内容

- PostRecord取得・作成API
- MissionFeedback取得・更新API
- 採用済みMissionへの「投稿しました」操作
- 投稿成功後のGOOD / NEUTRAL / BAD Feedback
- 投稿済み・現在Feedbackのサーバー再表示
- API contract、認証、scope、validation test

## 3. 主要な設計判断

- 投稿先はMissionに関連するSocialProfileのplatformから決定する
- SocialProfile未関連Missionでは誤ったplatformを推測せず投稿完了操作を無効にする
- FREE APIはpostedAtをサーバー時刻とし、source、externalPostId、manualMetricsを受け付けない
- PostRecord保存成功後だけFeedbackを表示する
- Feedback変更は現在値を更新し、CoreがActivity履歴を保持する
- DailyMission lifecycleを投稿操作から暗黙変更しない

## 4. Isolation / Security

- actorはverified sessionからのみ取得する
- Workspace / Bunshin / Mission scopeを全操作へ渡す
- 未認証、別scope、SUSPENDED Capabilityのmutationを拒否する
- mutationへsame-originとstrict JSON validationを適用する
- responseへ`cache-control: no-store`を付与する

## 5. 対象外

- SNS OAuth、自動投稿、Analytics API、externalPostId取得
- manual metrics、投稿成果入力
- AI、Knowledge、Memory自動学習、LINE、BLOG、Job

## 6. 次へ進む条件

- D-036とAPI/UXを人間レビューし、本PRを承認する
- 承認後、Phase 4 Daily Mission AI Generatorの実装順を再確認する
