# BUNSHIN Platform 実装ロードマップ

## 基本方針

BUNSHINはSNS投稿を完全自動化するサービスではなく、ユーザー専用のSNS戦略を設計し、毎日具体的な行動を提示するAI企画担当として作る。

FREEではBUNSHINが戦略・企画・文章・構成・外部AI向けPrompt・学習用Raw Eventを担当し、画像・動画制作とSNS投稿はユーザーが行う。SOCIALとBLOGはMulti-Bunshin Platform上のCapabilityとして分離し、既存`stockbusiness/bunshin-blog`はPhase 0の再利用方針に従って維持する。

## Phase 0: 現状棚卸し・設計確定

状態: 完了。

- `CURRENT_SYSTEM_AUDIT.md`
- `REUSE_MAP.md`
- `TARGET_ARCHITECTURE.md`

## Phase 1: Platform Foundation

状態: 完了。

- pnpm / Turborepo / Next.js基盤
- TypeScript、lint、format、test、build、CI
- 環境変数、logging、error、DB/Prisma基盤

## Phase 2: Multi-Bunshin Core

状態: コード実装完了。Production利用開始は`PHASE2_PRODUCTION_GATE.md`完了待ち。

- User / Workspace / Membership
- Bunshin / Objective / Audience / Personality
- Owner Knowledge / Grant
- Bunshin Memory
- Capability Contract / Assignment
- verified session、認可、tenant/Bunshin分離

## Phase 3: SOCIAL Foundation

状態: Slice 3.1〜3.5完了。3.6はAPI/UXまで実装済み、レビュー待ち。

### 3.1 Social Profile — 完了

- 手動Social Profile Core Persistence
- authenticated API / minimal UI

### 3.2 Content Pillar — 完了

- Content Pillar Core Persistence
- authenticated API / minimal UI

### 3.3 Weekly Plan — 完了

- Weekly Plan / Item Core Persistence
- authenticated API / minimal UI

### 3.4 Daily Mission Core — 完了

- DailyMission / MissionContent aggregate
- format別strict validation
- lifecycle、日付一意性、tenant/Bunshin境界
- API/UIはPhase 5で実装済み、AI生成は未実装

### 3.5 Social Account Strategy — 完了

- SocialAccountStrategy version / approval
- FREEでは1 BunshinにつきPrimary SNS 1件
- Strategy Wizard入力とCore Persistence
- Content Pillarとの責務境界

### 3.6 Mission Decision / Activity

- Core Persistence — 完了
- authenticated API / UX — 実装済み、レビュー待ち
- Mission lifecycleと採用判断を分離
- ACCEPTED / REJECTEDと不採用理由
- VIEWED / COPY等のappend-only Raw Activity
- 冪等な行動計測

### 3.7 Post Record / Feedback

- Core Persistence — 実装済み、レビュー待ち
- authenticated API / UX — 未実装
- 手動投稿完了とPostRecord
- GOOD / NEUTRAL / BADのMissionFeedback
- PreferenceとOutcomeの分離
- SNS API投稿・自動metrics取得なし

Phase 3.5〜3.7はCore Persistenceとauthenticated API/UIを別PRにする。AI生成、Provider、LINE、Jobを混在させない。

## Phase 4: SOCIAL Free MVP Intelligence

- Account Strategy Generator — 完了
- Grant済みOwner KnowledgeとBunshin context
- Weekly Planner
- Daily Mission Planner
- Content Generator
- Quality Checker
- `TEXT | SLIDE | IMAGE | LIVE_ACTION | AI_VIDEO_PROMPT`
- model、Prompt Version、使用量、原価、処理時間、成否の記録
- Provider Port / Adapter

画像・動画binaryを生成せず、外部サービスへ渡せる指示・Promptまでを提供する。

## Phase 5: Free MVP User Experience

- Account Strategy Wizard / approval — 完了
- Daily Mission API/UI — 完了
- 採用 / 不採用 / 不採用理由
- format別copy UX
- 1日1回を候補とする別案導線（Billing制限なし）
- 投稿完了
- 簡易Feedback
- mobile-firstの「今日やること」体験

## Phase 6: LINE Daily Experience

- LINE Login / session
- Messaging API
- Daily Push / Today Deep Link
- timezone / 配信設定
- 二重送信防止、失敗・再送管理

## Phase 7: 100-user Validation Readiness

- RegistrationからD7までのfunnel
- 投稿回数、継続率、GOOD率、AI原価
- 最低限の管理画面
- 利用規約、プライバシー、同意、削除・退会
- Production Gate、backup/restore、運用手順

ここで100人規模のFREE検証を行う。

## Phase 8: Share / Referral / Segmentation Preparation

FREE継続率を確認してから着手する。

- 個人情報・Knowledge・Memoryを含まないStrategy共有カード
- 最小Referral attribution
- 現金報酬なし
- Raw Activityに基づく将来Segmentation境界
- BunshinMemoryとMarketing Segmentを別resourceとして維持
- 7日成長レポート共有は将来候補

## Phase 9: PRO / Multiple Bunshin UX

- 無料1体、上位プラン複数体
- 複数SNS / 複数Mission
- 別案回数、Plan制限、決済
- 高度Memory

FREE継続率を確認する前に作り込まない。

## Phase 10: Publishing / Video Provider

100人検証後に再評価する。

- SNS OAuth
- PostMesh / Ayrshare / Late等のPublishing Adapter
- 承認型自動投稿
- metrics自動取得
- Template / Generative Video Adapter

## Phase 11: BLOG Capability Migration

- WordPress接続
- キーワード・記事・画像・公開処理
- SNS反応から記事化 / 記事からSNS展開
- 既存ブログ資産の段階移植

## 将来Phase

- Marketing Campaign Engine
- Goal / KPI Engine
- Need Detection / Offer Matching
- LINE Marketing、LP、Lead Generation、Sales
- Customer Support、Recruit

## FREE MVPで実装しないもの

- SNS完全自動投稿、SNS OAuth
- PostMesh、Ayrshare等のPublishing Provider
- 自動画像・動画生成、Canva完全連携
- 高度SNS Analytics、コメント自動返信
- 課金、代理店制度、ランキング、現金紹介報酬
- BLOG移行、Marketing Campaign Engine

## FREE MVP KPI

```text
Registration
-> Bunshin Creation
-> SOCIAL Activation
-> Strategy Completion
-> Strategy Approval
-> First Mission View
-> Mission Acceptance
-> Copy
-> Posted
-> D7 Active
```

最重要KPIは「7日間でBUNSHINの指示に従って3回以上実際に投稿したユーザー率」とする。

補助KPI:

- Strategy承認率
- Mission採用 / 不採用率
- Copy率、採用からCopy率、CopyからPosted率
- Mission完了率
- D1 / D7 / D30
- 別案率、Feedback GOOD率
- 1 Active User当たりAI原価

成功条件はSNSの完全自動化ではなく、BUNSHINの指示によってユーザーが継続的に行動することである。
