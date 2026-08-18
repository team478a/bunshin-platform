# BUNSHIN Platform Codex実装仕様書 v1.0

作成日: 2026-08-18  
対象: Codex / Claude Code等のAI開発エージェント  
状態: Initial approved specification

## 0. 最重要指示

このプロジェクトはSNS投稿生成SaaSではありません。

**1ユーザーが目的ごとに複数のBunshinを作成し、それぞれが独立した目的・人格・知識・記憶・成果データを持ち、Capability（仕事能力）を追加して活動するプラットフォーム**を実装します。

初期MVPでは `SOCIAL` Capabilityのみを実装します。途中まで存在する `stockbusiness/bunshin-blog` は捨てず、Phase 0で棚卸しし、後から `BLOG` Capabilityとして接続します。

判断の優先順位:

1. Multi-Bunshin構造を壊さない
2. User間・Bunshin間のデータ分離を守る
3. Capabilityを追加・交換できる構造にする
4. Provider依存をCoreへ混ぜない
5. MVP外機能を先回りして作らない
6. 既存ブログ資産を事実確認して再利用する
7. スマートフォン・LINE起点のUXを優先する

---

# 1. プロダクト定義

## 1.1 コンセプト

```text
USER / WORKSPACE
 ├─ Bunshin A「AI副業」
 │   ├─ Objective: 副業見込み客を集める
 │   ├─ SOCIAL
 │   └─ 将来: BLOG / LINE_MARKETING
 ├─ Bunshin B「営業専門家」
 │   ├─ Objective: 営業相談を獲得する
 │   ├─ SOCIAL
 │   └─ 将来: BLOG / LP / LEAD_GENERATION
 └─ Bunshin C「採用広報」
     ├─ Objective: 求職者を集める
     ├─ SOCIAL
     └─ 将来: RECRUIT / LINE_MARKETING
```

SNSはBUNSHINそのものではなく、Bunshinが最初に利用できるCapabilityです。

## 1.2 MVP価値

- 無料ユーザーは最初のBunshinを1体作成できる
- 内部データモデル/APIは複数Bunshinに対応する
- Bunshinへ目的、ターゲット、人格、発信方針を設定できる
- Bunshinが毎日「今日やるSNSミッション」を決定する
- 顔出し可否、声出し可否、利用可能時間に応じて形式を選択する
- 5枚スライド、実写台本、外部AI動画プロンプトを生成する
- ユーザーが投稿完了、スキップ、本人らしさを入力する
- 投稿履歴、本人由来データ、反応をBunshin単位で蓄積する
- LINEからDaily Missionを通知し、該当画面を開ける

## 1.3 MVP対象外

- Instagram/TikTok/Xへの完全自動投稿
- 自前の動画生成
- Canva完全自動連携
- 高度なSNS分析API連携
- コメント自動返信
- AI電話
- リスト収集・フォーム営業
- LP自動生成
- 複雑な紹介報酬
- 自律エージェントによる無承認実行

将来用の境界・interfaceは設計しても、実体を実装しません。

---

# 2. 用語と所有境界

## User

実際の利用者。1 Userは複数Bunshinを所有できます。

## Workspace

データ所有境界。MVPではUser登録時にPERSONAL Workspaceを自動作成します。将来BUSINESS/OEMへ拡張します。

## Bunshin

Userとは別のAI主体です。Bunshinごとに以下を独立保持します。

- Identity
- Objective
- Audience
- Personality
- Knowledge Grant
- Memory
- Capability
- Channel
- Mission
- Performance

## Owner Knowledge

User本人が所有する共通素材です。

- 経歴
- スキル
- 実績
- 商品・サービス
- FAQ
- 事例
- 資料・画像

全Bunshinが自動利用してはいけません。BunshinKnowledgeGrantで参照許可を管理し、デフォルトはDENYとします。

## Bunshin Memory

Bunshin専用の記憶です。他Bunshinへ暗黙共有しません。

## Capability

Bunshinが実行できる仕事能力です。

初期: `SOCIAL`

将来候補:

- `BLOG`
- `LINE_MARKETING`
- `LP`
- `RESEARCH`
- `LEAD_GENERATION`
- `SALES`
- `CUSTOMER_SUPPORT`
- `RECRUIT`

---

# 3. 推奨技術方針

Phase 0の調査結果により最終決定します。

```text
Frontend      React + TypeScript
Backend       NestJS + TypeScript
Database      PostgreSQL / Supabase
ORM           Prisma
Vector        pgvector
Auth          LINE Login + application session
Notification  LINE Messaging API
Package       pnpm
Monorepo      Turborepo候補
CI            typecheck / lint / test / build
```

推奨構造:

```text
bunshin-platform/
├─ apps/
│  ├─ web/
│  ├─ api/
│  └─ admin/
├─ packages/
│  ├─ bunshin-core/
│  ├─ capability-contract/
│  ├─ capability-social/
│  ├─ ai/
│  ├─ line/
│  ├─ database/
│  ├─ shared/
│  └─ observability/
├─ prisma/
├─ docs/
└─ tests/
```

既存ブログ統合後も `capability-blog` を独立Moduleとして扱います。

---

# 4. アーキテクチャ制約

## 4.1 BunshinとCapabilityの分離

禁止:

```text
Bunshin = SNS Account
Bunshin = Blog
User = Bunshin
```

正:

```text
Bunshin
 ├─ Identity / Objective / Memory
 └─ Capabilities
      ├─ SOCIAL
      └─ BLOG（将来）
```

## 4.2 Provider Adapter

OpenAI、Gemini、LINE、Canva、Instagram等のSDK型・APIレスポンスをCore Entityへ保存しません。

```ts
interface AIProvider {
  generateStructured<T>(
    input: AIGenerationInput,
    schema: Schema<T>,
  ): Promise<T>;
  embed(texts: string[]): Promise<number[][]>;
}
```

モデル名、API固有型、課金単位はAdapter層へ閉じ込めます。

## 4.3 Capability Contract

```ts
interface BunshinCapabilityHandler {
  readonly type: CapabilityType;
  activate(context: CapabilityContext): Promise<void>;
  getStatus(context: CapabilityContext): Promise<CapabilityStatus>;
}
```

Capability固有テーブルをCoreへ無理に統合しません。

---

# 5. Coreドメインモデル

## User

```text
id
workspaceId
lineUserId unique
email nullable
status
plan
locale
timezone
createdAt
updatedAt
```

## Workspace

```text
id
name
type: PERSONAL | BUSINESS
status
createdAt
updatedAt
```

## Bunshin

```text
id
workspaceId
ownerUserId
name
slug
type: COPY | EXPERT | BRAND | CHARACTER
status: DRAFT | ACTIVE | PAUSED | ARCHIVED
objectiveSummary
audienceSummary
personalitySummary
avatarUrl nullable
createdAt
updatedAt
```

推奨一意制約: `ownerUserId + slug`

## BunshinObjective

```text
id
bunshinId
objectiveType
primaryGoal
kpiName nullable
kpiTarget nullable
kpiPeriod nullable
priority
status
createdAt
updatedAt
```

## BunshinAudience

```text
id
bunshinId
label
ageRange nullable
occupation nullable
experienceLevel nullable
painPoints Json
desires Json
excludedAudience Json
notes nullable
```

## BunshinPersonality

```text
id
bunshinId
tone
formality
energyLevel
expertiseLevel
sentenceStyle
firstPerson
forbiddenExpressions Json
preferredExpressions Json
visualDirection nullable
facePolicy: FACE_OK | FACE_NG_VOICE_OK | FACE_VOICE_NG | FULL_ANONYMOUS
createdAt
updatedAt
```

## OwnerKnowledge

```text
id
workspaceId
ownerUserId
type: PROFILE | EXPERIENCE | SKILL | PRODUCT | FAQ | CASE | ASSET | OTHER
title
content
sourceType: MANUAL | IMPORT | SYSTEM
status
createdAt
updatedAt
```

## BunshinKnowledgeGrant

```text
id
bunshinId
ownerKnowledgeId
access: ALLOW | DENY
createdAt
```

## BunshinMemory

```text
id
bunshinId
type: BELIEF | EXPERIENCE | KNOWLEDGE | STORY | FAQ | OPINION | PREFERENCE | PERFORMANCE_INSIGHT
content
summary nullable
sourceType: USER_INPUT | MISSION_FEEDBACK | PERFORMANCE | IMPORT | SYSTEM
sourceId nullable
confidence
importance
embedding vector nullable
active
createdAt
updatedAt
```

## BunshinCapability

```text
id
bunshinId
capabilityType
status: ACTIVE | PAUSED | LOCKED
config Json
activatedAt
updatedAt
```

---

# 6. SOCIAL Capabilityモデル

## SocialProfile

MVPではSNS API接続ではなく発信設定を保持します。

```text
id
bunshinId
platform: INSTAGRAM | TIKTOK | X | OTHER
handle nullable
profileUrl nullable
purpose
postingFrequency
preferredFormats Json
status
createdAt
updatedAt
```

## ContentPillar

```text
id
bunshinId
name
description
purpose
weight
active
createdAt
updatedAt
```

Bunshin作成時に5〜10個生成します。

## WeeklyPlan / WeeklyPlanItem

```text
WeeklyPlan:
 id, bunshinId, weekStartDate, strategySummary, status

WeeklyPlanItem:
 id, weeklyPlanId, scheduledDate, contentPillarId,
 goal, angle, recommendedFormat, notes
```

## DailyMission

```text
id
bunshinId
socialProfileId nullable
weeklyPlanItemId nullable
missionDate
status: GENERATED | VIEWED | STARTED | COMPLETED | SKIPPED | EXPIRED
format: SLIDE | LIVE_ACTION | AI_VIDEO_PROMPT | IMAGE
estimatedMinutes
topic
angle
reason
contentJson
qualityScore nullable
createdAt
viewedAt nullable
completedAt nullable
```

通常Missionの一意性: `bunshinId + missionDate`

## MissionFeedback

```text
id
dailyMissionId
bunshinId
userId
posted: YES | LATER | NO
fitRating: GOOD | NEUTRAL | BAD nullable
comment nullable
createdAt
```

## PostRecord

```text
id
bunshinId
dailyMissionId
platform
postUrl nullable
postedAt
manualMetrics Json nullable
createdAt
updatedAt
```

---

# 7. Bunshin作成フロー

```text
LINE Login
 → User + PERSONAL Workspace
 → Bunshin Wizard
 → AI構造化
 → User確認・修正
 → SOCIAL Capability有効化
 → 最初のMission生成
```

必須質問:

1. 分身名
2. 何をする分身か
3. 誰に向けて発信するか
4. 達成したい目的
5. 発信テーマ
6. 商品・誘導先
7. 口調
8. 顔出し可否
9. 声出し可否
10. 1日使える時間

長い初回アンケートは避け、追加知識は継続質問で収集します。

AI出力例:

```json
{
  "identity": {
    "name": "AI副業案内人",
    "type": "EXPERT",
    "summary": "..."
  },
  "objective": {
    "primaryGoal": "...",
    "kpiSuggestion": "LINE登録数"
  },
  "audience": {
    "label": "副業初心者の会社員",
    "painPoints": [],
    "desires": []
  },
  "personality": {
    "tone": "friendly",
    "formality": "polite",
    "facePolicy": "FULL_ANONYMOUS"
  },
  "contentPillars": []
}
```

Schema Validation失敗時は自動修復または再生成します。

---

# 8. Daily Mission生成

## 入力

- Bunshin Identity / Objective / Audience / Personality
- 許可されたOwnerKnowledge
- 同一BunshinのMemory
- ContentPillar / WeeklyPlan
- 過去30〜90日のMission履歴
- MissionFeedback
- facePolicy
- 利用可能時間

他BunshinのMemoryや履歴を入力へ混ぜてはいけません。

## 投稿形式選択

```text
3分以下     IMAGE または簡易SLIDE
5分程度     5枚SLIDE
10分程度    5〜7枚SLIDE / AI_VIDEO_PROMPT
20分以上    LIVE_ACTION / AI_VIDEO_PROMPTを許可
```

```text
FACE_OK             全形式候補
FACE_NG_VOICE_OK    SLIDE / ナレーション / AI_VIDEO_PROMPT
FACE_VOICE_NG       SLIDE / IMAGE / AI_VIDEO_PROMPT
FULL_ANONYMOUS      SLIDEを標準
```

ルールで候補を絞り、その後AIが最終決定します。

## SLIDE Schema

```json
{
  "topic": "...",
  "angle": "...",
  "reason": "...",
  "estimatedMinutes": 5,
  "slides": [
    {"index": 1, "role": "HOOK", "headline": "...", "body": "..."},
    {"index": 2, "role": "PROBLEM", "headline": "...", "body": "..."},
    {"index": 3, "role": "INSIGHT", "headline": "...", "body": "..."},
    {"index": 4, "role": "SOLUTION", "headline": "...", "body": "..."},
    {"index": 5, "role": "CTA", "headline": "...", "body": "..."}
  ],
  "caption": "...",
  "hashtags": ["..."]
}
```

## LIVE_ACTION Schema

```json
{
  "topic": "...",
  "estimatedMinutes": 10,
  "shootingInstruction": "...",
  "script": [
    {"seconds": "0-3", "role": "HOOK", "text": "..."},
    {"seconds": "3-20", "role": "BODY", "text": "..."},
    {"seconds": "20-30", "role": "CTA", "text": "..."}
  ],
  "caption": "..."
}
```

## AI_VIDEO_PROMPT Schema

```json
{
  "topic": "...",
  "estimatedMinutes": 10,
  "toolSuggestion": "Gemini",
  "videoSettings": {
    "aspectRatio": "9:16",
    "durationSeconds": 8,
    "style": "..."
  },
  "prompt": "...",
  "overlayText": ["..."],
  "caption": "..."
}
```

動画自体はMVPで生成しません。

---

# 9. 重複防止・本人由来データ

## 重複防止

保存対象:

- topic
- angle
- hook
- content summary
- format
- CTA
- embedding

候補テーマを同一Bunshinの過去履歴と比較し、高類似ならRejectして再生成します。文字列が異なっても意味が近ければ重複と判定します。

## 継続質問

例:

- 最近お客様から聞かれた質問はありますか
- この業界で間違っていると思う常識は何ですか
- 最近の失敗や気づきはありますか
- 初心者へ一つ教えるなら何ですか

回答方法:

- テキスト
- 音声（Phaseに応じて）
- スキップ

Memory Extractorが `BELIEF / EXPERIENCE / KNOWLEDGE / STORY / FAQ / OPINION` 等へ分類し、User確認・編集・削除可能な設計にします。

---

# 10. LINE UX

LINEは通知と入口です。大量の本文を複数Pushせず、原則1通知からToday/Mission画面へ遷移します。

通知例:

```text
今日の分身ミッションができました
分身: AI副業
所要時間: 5分
テーマ: 副業初心者が最初にやること
[今日の投稿を見る]
```

要件:

- timezone対応
- 通知時間設定
- 毎日 / 平日 / 週3回等へ拡張可能
- inactive userへの過剰Pushを避ける
- Mission生成と通知の二重実行防止
- Deep Linkで対象Bunshin/Missionを開く

---

# 11. API方針

MVP候補:

```text
POST   /auth/line
GET    /me

GET    /bunshins
POST   /bunshins
GET    /bunshins/:bunshinId
PATCH  /bunshins/:bunshinId
DELETE /bunshins/:bunshinId

GET    /owner-knowledge
POST   /owner-knowledge
POST   /bunshins/:bunshinId/knowledge-grants

GET    /bunshins/:bunshinId/memories
POST   /bunshins/:bunshinId/memories
PATCH  /bunshins/:bunshinId/memories/:memoryId
DELETE /bunshins/:bunshinId/memories/:memoryId

POST   /bunshins/:bunshinId/capabilities/social/activate
GET    /bunshins/:bunshinId/social/profile
PATCH  /bunshins/:bunshinId/social/profile
GET    /bunshins/:bunshinId/social/missions/today
GET    /bunshins/:bunshinId/social/missions
GET    /bunshins/:bunshinId/social/missions/:missionId
POST   /bunshins/:bunshinId/social/missions/:missionId/regenerate
POST   /bunshins/:bunshinId/social/missions/:missionId/complete
POST   /bunshins/:bunshinId/social/missions/:missionId/skip
POST   /bunshins/:bunshinId/social/missions/:missionId/feedback
```

URLの `bunshinId` を信用せず、Workspace/User所有権を毎回検証します。

---

# 12. UI

スマートフォンファーストです。

MVP画面:

1. Welcome
2. Bunshin Wizard
3. Bunshin Summary
4. Today
5. Mission Detail
6. Bunshin List
7. Bunshin Detail
8. History
9. Settings

Today画面では多機能メニューを中心にせず、最上部に**今日やること**を表示します。

Mission Detail:

- テーマ
- 選定理由
- 所要時間
- スライド/台本/プロンプト
- コピー
- 別案
- 簡単にする
- 投稿完了
- スキップ
- 本人らしさ評価

---

# 13. AI処理

1回の巨大Promptで全処理を行いません。

- Task A: Bunshin Profile Builder
- Task B: Mission Planner
- Task C: Content Generator
- Task D: Quality Checker
- Task E: Memory Extractor

全TaskにPrompt Versionを持たせます。

AI Generation Log:

```text
id
workspaceId
userId
bunshinId nullable
taskType
provider
model
promptVersion
inputTokens nullable
outputTokens nullable
estimatedCost nullable
latencyMs
status
errorCode nullable
createdAt
```

Prompt全文・個人情報を無制限保存しません。

---

# 14. Scheduler / Job

必須Job候補:

- GenerateWeeklyPlanJob
- GenerateDailyMissionJob
- SendDailyLineNotificationJob
- ExpireOldMissionJob
- RebuildMissionEmbeddingJob

HTTP request lifecycleへCron処理を直書きしません。

冪等キー例:

```text
daily_mission:{bunshinId}:{localDate}
line_daily_push:{bunshinId}:{missionId}
memory_extract:{sourceType}:{sourceId}:{promptVersion}
```

---

# 15. Plan Policy

課金はMVP後でも、制限はPolicyとして分離します。

```text
FREE
 maxBunshins = 1
 socialDailyMissions = 1
 advancedMemory = false
 blogCapability = false

PERSONAL（仮）
 maxBunshins = 3
 advancedMemory = true

PRO（仮）
 maxBunshins = 10
 blogCapability = true
```

数値を画面やServiceへ散在させません。

---

# 16. 既存ブログ版の扱い

Phase 0で `stockbusiness/bunshin-blog` を調査し、次へ分類します。

共通化候補:

- User/Auth
- LINE
- AI Provider
- Prompt
- Scheduler
- Admin
- Logging
- Billing

BLOG専用:

- WordPress接続
- キーワード
- 記事生成
- SEO
- ASP
- 公開処理
- ブログ成果

分類値:

- `REUSE_AS_IS`
- `REFACTOR_TO_SHARED`
- `KEEP_AS_BLOG_CAPABILITY`
- `REIMPLEMENT`
- `REMOVE`
- `UNKNOWN`

Phase 0必須成果物:

```text
docs/CURRENT_SYSTEM_AUDIT.md
docs/REUSE_MAP.md
docs/TARGET_ARCHITECTURE.md
```

Phase 0完了前に全面Rewrite、WordPress機能削除、破壊的DB変更を行いません。

---

# 17. セキュリティ・プライバシー

- すべてのQueryでWorkspace ownershipを検証する
- Bunshin Memoryを別Bunshinへ渡さない
- OwnerKnowledgeはGrantされたものだけ使う
- Memoryは表示・編集・削除・無効化可能にする
- LINE secret、DB URL、AI key、encryption key、session secret、cron secretをCommitしない
- `.env.example` にはキー名のみを記載する
- Webhook署名、Cron認証、管理者権限を検証する
- Tokenや個人情報をLogへ出さない
- AIへ必要最小限のContextだけを送る

---

# 18. エラー・Observability

ユーザーへ技術エラーを直接表示しません。

Fallback例:

- AI timeout: 再試行可能な一般メッセージ
- invalid AI JSON: schema repair後に再試行
- embedding failure: 類似判定なしでMission生成し、警告を残す
- LINE送信失敗: retry + admin log

最低ログContext:

```text
requestId
userId
workspaceId
bunshinId
missionId
jobId
aiTaskType
status
latency
errorCode
```

---

# 19. テスト

## Unit

- Plan Policy
- Mission format selection
- Bunshin ownership
- Memory scope
- Content Schema
- Duplicate threshold

## Integration

必須:

1. Cross User Isolation
2. Cross Bunshin Memory Isolation
3. Mission Idempotency
4. Capability Permission
5. Knowledge Grant

例:

```text
User1
 ├─ Bunshin A: Memory「営業」
 └─ Bunshin B
```

Bunshin BのMemory API・AI Contextに「営業」が含まれないことを検証します。

## E2E

```text
LINE/Auth mock
 → Bunshin作成
 → SOCIAL有効化
 → Mission生成
 → Mission閲覧
 → complete
 → feedback
 → Memory反映
```

PRごとに最低限:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

---

# 20. 実装Phase

詳細は `IMPLEMENTATION_ROADMAP.md` を参照してください。

- Phase 0: 既存ブログ棚卸し・目標設計
- Phase 1: Platform Foundation
- Phase 2: Multi-Bunshin Core
- Phase 3: SOCIAL Foundation
- Phase 4: Daily Mission MVP
- Phase 5: LINE Daily Experience
- Phase 6: Memory / Originality
- Phase 7: 100-user Validation Readiness
- Phase 8: PRO / Multiple Bunshin UX
- Phase 9: BLOG Capability Migration

Phase 0で停止し、文書レビュー後にPhase 1へ進みます。

---

# 21. MVP受入基準

## Core

- [ ] LINE/アプリ認証ができる
- [ ] UserにWorkspaceが作成される
- [ ] 複数Bunshin対応のデータモデルである
- [ ] BunshinごとのObjective/Audience/Personalityが独立する
- [ ] Bunshin Memoryが分離される
- [ ] CapabilityがBunshinへ紐づく

## SOCIAL

- [ ] SOCIALを有効化できる
- [ ] ContentPillarを生成できる
- [ ] Daily Missionを生成できる
- [ ] 5枚スライドを生成できる
- [ ] 実写台本Schemaを扱える
- [ ] AI動画Prompt Schemaを扱える
- [ ] complete / skip / feedbackを記録できる

## Originality

- [ ] 同一Bunshinの過去Missionを検索できる
- [ ] 高類似テーマをRejectできる
- [ ] 本人回答をMemory化できる
- [ ] 他BunshinのMemoryを参照しない

## LINE / Quality

- [ ] Daily Mission通知
- [ ] Deep Link
- [ ] timezone
- [ ] 二重生成・二重送信防止
- [ ] AI generation log
- [ ] error log
- [ ] funnel / completion / GOOD率 / D1-D7データ
- [ ] typecheck / lint / test / build PASS

---

# 22. 検証KPI

SNS再生数より先に次を測定します。

- Activation: LINE登録 → Bunshin作成
- First Value: Bunshin作成 → 最初のMission閲覧
- Mission Completion
- Bunshin Fit: GOOD率
- D1 / D7 / D30 Retention
- 副業 / スキル販売 / 個人事業 / 求人等のセグメント別継続率
- 1アクティブユーザー当たりAI・LINE原価

最大の検証命題は、**AIが毎日実行可能な仕事を決めることで、ユーザーがSNS活動を継続するか**です。

---

# 23. Codex作業ルール

各Phaseで次を行ってください。

1. 現状コードと文書を読む
2. 差分計画を作る
3. 小さい単位で実装する
4. Migrationを確認する
5. Testを書く
6. typecheck / lint / test / buildを実行する
7. 文書を更新する
8. 完了報告を作る

大規模一括Rewriteは禁止です。

既存コードが仕様と違う場合:

```text
現状
仕様との差分
推奨修正
破壊的変更の有無
代替案
```

を報告してください。

---

# 24. 最初の実行指示

最初の作業ではアプリを実装しません。

1. `AGENTS.md` と本仕様書を読む
2. `stockbusiness/bunshin-blog` を実コードで調査する
3. User/Auth/LINE/AI/Scheduler/DB/Admin/WordPressを棚卸しする
4. Multi-Bunshinを阻害する設計を抽出する
5. 再利用分類を行う
6. 以下を作成する

```text
docs/CURRENT_SYSTEM_AUDIT.md
docs/REUSE_MAP.md
docs/TARGET_ARCHITECTURE.md
```

7. Phase 1実装範囲と人間が判断すべき事項を提示する
8. Phase 1の実装を開始せず停止する

具体的な投入文は `docs/CODEX_INITIAL_INSTRUCTION.md` を使用してください。

---

# 25. 最終ゴール

```text
LINE登録
 → 最初のBunshinを作成
 → 目的・ターゲット・人格を設定
 → SOCIAL Capabilityを利用
 → 毎日「今日やること」が届く
 → 5分程度でSNS投稿を作る
 → 投稿・評価・本人回答を蓄積
 → Bunshin専用Memoryが育つ
```

その後、複数Bunshin、BLOG、LINE_MARKETING、LEAD_GENERATION、SALES、SUPPORTへ拡張します。

BUNSHIN Platformの競争力は投稿生成そのものではなく、**複数の分身が独立した目的・人格・記憶・能力・成果を持ち、外部AIやサービスを道具として使いながら仕事を増やしていけること**に置きます。
