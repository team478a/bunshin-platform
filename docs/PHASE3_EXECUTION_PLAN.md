# Phase 3 SOCIAL Foundation 実行計画

作成日: 2026-08-19

## 1. 目的

Phase 3ではSOCIAL Capability固有のdomainをCoreから分離して構築する。Phase 4のDaily Mission MVPに必要な永続化と状態境界を先に確立し、AI、Provider、Job、LINEを混在させない。

## 2. 開始条件

- Phase 2 Completion Auditが承認・merge済み
- SOCIAL Capability AssignmentとACTIVE guardが利用可能
- Phase 3の各Sliceは実装前指示書を先にレビューする
- Production Gate未完了の間もlocal/CIで設計・実装できるが、一般ユーザーへ公開しない

## 3. 推奨Slice

### Slice 3.1: Social Profile

- SOCIAL固有package境界
- 発信先platform、目的、頻度、希望形式の手動設定
- ACTIVE SOCIAL Assignmentによるmutation guard
- 3.1-A Core Persistenceと3.1-B authenticated API/UIに分割

### Slice 3.2: Content Pillar

- Bunshinごとの発信テーマ
- 手動CRUD、weight、active状態
- AIによる5〜10個生成は実装しない

### Slice 3.3: Weekly Plan

- WeeklyPlan / WeeklyPlanItemの永続化
- local dateとweek start規則
- 手動作成・確定・失効の状態境界
- AI plannerとschedulerは実装しない

### Slice 3.4: Daily Mission Persistence

- DailyMissionとMission Content schemaの永続化
- `workspaceId + bunshinId + missionDate`による通常Mission一意性
- 状態遷移と同一日重複防止
- AI生成、regenerate、Jobは実装しない

### Slice 3.5: Feedback / Post Record

- MissionFeedback
- PostRecord
- manual completionとmanual metrics
- SNS API投稿・自動metrics取得は実装しない
- 3.5-A Core Persistenceと3.5-B authenticated API/UIに分割

## 4. 不変条件

- SOCIAL固有model、validation、状態機械をCore entityへ追加しない
- すべてのSOCIAL resourceは`workspaceId + bunshinId`でscopeする
- mutation前にSOCIAL AssignmentがACTIVEであることをapplication層で確認する
- Bunshin Aのprofile、pillar、plan、mission、feedback、post recordをBunshin Bへ利用しない
- Provider SDK型、AI response、SNS credentialをdomainへ保存しない
- HTTP lifecycleへscheduler、retry、投稿処理を直書きしない
- 自動投稿とSNS API接続はMVP対象外のまま維持する

## 5. Phase 3で実装しないもの

- OpenAI、Gemini、Anthropic等による生成
- Prompt、embedding、RAG、重複類似判定
- SNS API接続、自動投稿、metrics自動取得
- LINE通知、Deep Link、Webhook
- Job table、worker、scheduler、retry
- 動画生成、Canva連携
- BLOG Capability

## 6. Phase 3完了条件

- Social Profile、Content Pillar、Weekly Plan、Daily Mission、Feedback、Post Recordの基礎modelがSOCIAL境界内にある
- Cross Workspace / Cross Bunshin / missing Capability testが成功する
- 同一日・同一Bunshinの通常Mission重複をDB制約で防ぐ
- 投稿生成失敗時に不完全データを公開しない状態設計が確立している
- Phase 4がAI生成をadapterとして追加できるportを持つ
