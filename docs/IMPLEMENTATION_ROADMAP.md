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

状態: コード実装完了。FREE MVP全体のProduction利用開始判定は`FREE_MVP_PRODUCTION_GATE.md`で行う。

- User / Workspace / Membership
- Bunshin / Objective / Audience / Personality
- Owner Knowledge / Grant
- Bunshin Memory
- Capability Contract / Assignment
- verified session、認可、tenant/Bunshin分離

## Phase 3: SOCIAL Foundation

状態: 完了。

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

### 3.6 Mission Decision / Activity — 完了

- Core Persistence — 完了
- authenticated API / UX — 完了
- Mission lifecycleと採用判断を分離
- ACCEPTED / REJECTEDと不採用理由
- VIEWED / COPY等のappend-only Raw Activity
- 冪等な行動計測

### 3.7 Post Record / Feedback — 完了

- Core Persistence — 完了
- authenticated API / UX — 完了
- 手動投稿完了とPostRecord
- GOOD / NEUTRAL / BADのMissionFeedback
- PreferenceとOutcomeの分離
- SNS API投稿・自動metrics取得なし

Phase 3.5〜3.7はCore Persistenceとauthenticated API/UIを別PRにする。AI生成、Provider、LINE、Jobを混在させない。

## Phase 4: SOCIAL Free MVP Intelligence

状態: 完了。

- Account Strategy Generator — 完了
- Grant済みOwner KnowledgeとBunshin context
- Weekly Planner — 完了
- Daily Mission Planner Brief — 完了
- Daily Mission生成orchestration — 完了
- Content Generator / Quality Checker — 完了
- `TEXT | SLIDE | IMAGE | LIVE_ACTION | AI_VIDEO_PROMPT` — 完了
- model、Prompt Version、使用量、処理時間、成否の構造化ログ — 完了
- Provider Port / OpenAI Adapter — 完了
- verified-session生成APIと「今日のMission」UI — 完了
- 品質合格後だけMission / Content / Decisionをatomic保存 — 完了
- Stage 1 / Stage 2品質検査と最大1回repair — 完了
- DB idempotency claim、同時生成抑止、失敗状態 — 完了
- Provider timeout・rate limit・不正JSON分類 — 完了

画像・動画binaryを生成せず、外部サービスへ渡せる指示・Promptまでを提供する。Job、LINE、SNS自動投稿、Memory自動学習、BLOGはPhase 4完了条件へ含めない。

## Phase 5: Free MVP User Experience

状態: 完了。Production利用開始は`FREE_MVP_PRODUCTION_GATE.md`完了待ち。

- Account Strategy Wizard / approval — 完了
- Daily Mission API/UI — 完了
- 採用 / 不採用 / 不採用理由 — 完了
- format別copy UX — 完了
- 投稿完了 — 完了
- 簡易Feedback — 完了
- mobile-firstの「今日やること」体験 — 完了
- 別案生成 — FREEの利用状況を確認してから回数・課金境界と合わせて再判断

## Phase 6: LINE Daily Experience

状態: 6-A、6-C Core、6-D、6-E、6-F、6-G1、6-G2a、6-G2bのコード実装済み。Production利用開始は外部設定とGo/No-Go実行待ち。詳細は`PHASE6_LINE_IMPLEMENTATION_PLAN.md`を正本とする。

- 6-0: 実装計画、認証Session ADR、schema・秘密値・migration境界の確定
- 6-A: Secure Configuration。環境分離、暗号化設定、自動生成URL、管理画面、接続テスト、Audit、rotation（完了）
- 6-B0: Auth Session Spike。Supabase Custom OIDC採用、Provider/Application Callback分離、環境別外部設定Gate（実装中）
- 6-B: LINE Identity。LINE Login、既存Userへの明示連携、解除、LINE内ブラウザ（6-B0レビュー・外部設定後）
- 6-C: Webhook / Connection Core。署名、follow/unfollow、友だち状態、環境別冪等性、未送信取消、recipient resolver（完了。postback業務処理とProduction接続は後続）
- 6-D: Notification Preferences。通知同意、時刻、timezone、頻度、停止（完了）
- 6-E: Job / Mission Automation。Job Core、lease、retry、Producer、認証Scheduler / Worker、Weekly / Daily handler、Vercel Cron設定まで完了
- 6-F1（完了）: 配信・試行履歴Core、環境別用途分離鍵、短期・single-use Mission Deep Link state
- 6-F2a（完了）: Messaging Provider Port / LINE Adapter、配信lease、Provider障害分類、quota優先制御Core
- 6-F2b1（完了）: Mission生成成功後の配信Job、Connection resolver、短期Deep Link発行、Push、retry分類の接続
- 6-F2b2a（完了）: verified sessionでのsingle-use Mission Callback、所有権再検証、VIEWED記録
- 6-F2b2b（未実装）: LINE Identity接続後の未ログイン復帰。管理者警告は6-G2b2で実装済み
- 6-G1（完了）: 環境別の通知可能数、配信状態、失敗分類、Retry / Dead Jobを管理画面・APIで可視化
- 6-G2a（完了）: 再試行可能なFAILED配信の理由付き限定再送、環境別監査、同一失敗回の二重操作防止
- 6-G2b1（完了）: 環境別LINE Funnel、Open率、通知→投稿完了率、解除・ブロック相当率の管理API/UI
- 6-G2b2（コード完了）: 外部管理者通知、非送信Readiness、Production LINE Go/No-Go workflow。Vercel/GitHub Secret登録と本番実行は未完了

LINEはMissionへの通知と入口に限定し、投稿本文・KnowledgeをPushしない。`LINE_MARKETING`、販促ステップ配信、AI自動返信、LINE上でのSNS自動投稿はPhase 6へ含めない。

LINE設定とLINE公式アカウントはProduction / Stagingで分離する。すべての外部処理でruntime environmentとconfiguration environmentを照合し、Callback / Webhook / LIFF / Deep Link URLは環境別アプリURLから原則自動生成する。

## Phase 7: 100-user Validation Readiness

- RegistrationからD7までのfunnel（集計Core / OWNER・ADMIN API完了）
- 投稿回数、継続率、GOOD率（集計Core / OWNER・ADMIN API完了）
- AI使用量（Raw Event保存・管理画面集計完了）
- AI見積原価（保存・集計欄完了。公式価格版の確認後に単価適用）
- 最低限の管理画面（期間指定、最重要KPI、行動指標、funnel完了）
- 利用規約・プライバシーのPlatform Admin版管理／公開（完了）
- 公開中の規約・プライバシーへのユーザー同意、版更新時の再同意（完了）
- 本人による退会要求・取消、14日猶予、管理者確認（完了）
- 猶予期間後の匿名化・削除実行（PR A〜Dコード完了。Productionはdisabled、Service Role Key登録・dry-run・Go承認待ち）
- Production Gate監査、backup/restore・incident手順、health smoke workflow（完了）
- Auth公開設定・最新migration・Health Smoke完了。本番Dashboard残確認、restore rehearsal、Magic Link / FREE MVP smoke、退会dry-run、Go承認は未完了

ここで100人規模のFREE検証を行う。

### Phase 7-O: Operations Admin Console

日常運用でファイル編集、Vercel環境変数の更新、サーバー操作を必要としない管理画面を整備する。詳細は`OPERATIONS_ADMIN_CONSOLE_PLAN.md`を正本とする。

- 運用設定の状態一覧と管理画面入口
- ユーザー一覧・検索・ユーザー詳細（完了）
- 全体Funnel・運用指標・離脱候補の表示（完了）
- OpenAI APIキー・モデル・停止設定の暗号化管理
- 既存LINE設定管理の入口統合
- LINEリッチメニューの作成・公開・切替・停止
- 環境分離、版管理、接続確認、監査履歴

DB接続、Session、暗号化親鍵、Cron認証等の起動に必要な秘密値は管理画面へ移さない。

### Phase 7-U: Mobile-first UI Readiness

100-user Validation開始前に、`docs/UI_DESIGN_FOUNDATION.md`を基準として主要利用導線を刷新する。

- UI-0: Design Foundation、Decision、PR分割（文書）
- UI-1: Token / Primitive / Login / Confirm / Consent
- UI-2: Authenticated App Shell / Bottom Navigation / Profile
- UI-3: Bunshin Onboarding
- UI-4: Home / Today / Mission Decision・Copy・Post・Feedback
- UI-5: SOCIAL Settingsの情報設計
- UI-6: Admin Shell / Responsive / Accessibility / Final QA

UI変更では既存Coreの意味、Isolation、外部Provider境界を変更しない。FREE検証開始条件へ、スマートフォンでLoginから初回投稿完了まで到達できることを追加する。

### Phase 7-C: Adaptive Content Assistance

状態: 作成支援レベルのCore PersistenceとSocialProfile初期設定API/UIを実装。Mission表示以降は未実装。詳細は`ADAPTIVE_CONTENT_ASSISTANCE_PLAN.md`を正本とする。

SNS、投稿方法、BUNSHINが作る範囲を分離し、利用者が必要とする支援量で今日のMissionを実行できるようにする。

- `IDEA_ONLY | GUIDED | READY_TO_USE`の作成支援レベル — Core完了
- SocialProfileの初期値とDailyMissionのsnapshot — Core完了
- SocialProfileの初期設定API/UI（日本語3択） — 完了
- SNS別投稿セットと自動選択Domain Policy
- 企画、作り方、完成版の段階表示
- 画像・動画を作るための指示文を含む形式別コピー
- 投稿本文や指示文をPushしないLINE安全要約
- 支援レベル別Funnel、投稿完了率、AI使用量・見積原価

第1段階は既存のMissionContent必須1対1aggregateとatomic生成を維持し、表示と行動計測を段階化する。AIの段階生成は利用実績と原価を確認した後の独立判断とし、画像・動画本体生成、SNS自動投稿、管理画面からの本番Prompt自由編集を含めない。

### Phase 7-D: Evidence-based Trend Research

状態: 設計提案。Core / Provider / Job / UIは未実装。詳細は`TREND_RESEARCH_DELIVERY_PLAN.md`を正本とする。

- 「バズ保証」ではなく、最新情報を調べた利用者向け動画企画を提供する
- 初期FREE検証は週1回、最大3候補を基本とする
- `TrendResearchPort`と交換可能なProvider Adapter
- Evidence、取得日時、有効期限、適合理由を持つ候補
- Workspace / User / Bunshin isolationとquery最小化
- 週次冪等Job、quota、原価、期限切れ、通常Mission fallback
- Mission画面の出典表示とLINE安全要約
- SNS無断スクレイピング、成果保証、画像・動画本体生成は含めない

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
