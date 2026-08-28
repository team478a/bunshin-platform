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
- API/UIはPhase 5、AI生成はPhase 4で実装済み

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
- 6-B0（完了）: Supabase Custom OIDC採用、Provider/Application Callback分離、環境別外部設定Gate
- 6-B: LINE LoginとLINE起点sessionは完了。既存Userへの追加Identityの明示連携・解除は、複数認証手段を利用者へ提供する段階まで保留
- 6-C: Webhook / Connection Core。署名、follow/unfollow、友だち状態、環境別冪等性、未送信取消、recipient resolver（完了。postback業務処理とProduction接続は後続）
- 6-D: Notification Preferences。通知同意、時刻、timezone、頻度、停止（完了）
- 6-E: Job / Mission Automation。Job Core、lease、retry、Producer、認証Scheduler / Worker、Weekly / Daily handler、Vercel Cron設定まで完了
- 6-F1（完了）: 配信・試行履歴Core、環境別用途分離鍵、短期・single-use Mission Deep Link state
- 6-F2a（完了）: Messaging Provider Port / LINE Adapter、配信lease、Provider障害分類、quota優先制御Core
- 6-F2b1（完了）: Mission生成成功後の配信Job、Connection resolver、短期Deep Link発行、Push、retry分類の接続
- 6-F2b2a（完了）: verified sessionでのsingle-use Mission Callback、所有権再検証、VIEWED記録
- 6-F2b2b（完了）: LINE通知から未ログインで開いた場合、LINE認証と必要な規約同意の後に、短期Cookieで保持した元のMissionへ安全に復帰する。戻り先は`/today?state=...`だけを許可し、Mission所有権は復帰後に再検証する
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
- Production Gate証跡管理（コード完了）: 対象commit別の確認・取消履歴、SUPER_ADMIN限定更新、最終承認の前提確認、管理画面の開始判定。Migration適用と実際の証跡登録は本番運用時に行う
- トレンド調査Production Gate（コード完了）: Provider自動確認、本番調査smoke証跡、最終承認の前提接続。APIキー登録、接続確認、本番smoke記録は運用時に行う

ここで100人規模のFREE検証を行う。

### Phase 7-O: Operations Admin Console

日常運用でファイル編集、Vercel環境変数の更新、サーバー操作を必要としない管理画面を整備する。詳細は`OPERATIONS_ADMIN_CONSOLE_PLAN.md`を正本とする。

- 運用設定の状態一覧と管理画面入口
- ユーザー一覧・検索・ユーザー詳細（完了）
- 全体Funnel・運用指標・離脱候補の表示（完了）
- OpenAI APIキー・モデル・停止設定の暗号化管理と全生成経路への接続（完了）
- 既存LINE設定管理の入口統合
- LINEリッチメニューCore（定義、領域、環境別version、監査、公開・停止Port）（完了）
- LINEリッチメニュー管理画面（テンプレート、画像登録、確認、公開・切替・停止）（完了）
- 環境分離、版管理、接続確認、監査履歴
- 設定状態の一括確認、警告、操作・復旧ガイド（完了）
- 100人検証開始前の自動確認と、人間確認を混同しないProduction Gate一覧（完了）
- 話題調査Providerの自動確認、実行smoke証跡、操作・復旧ガイド（完了）

DB接続、Session、暗号化親鍵、Cron認証等の起動に必要な秘密値は管理画面へ移さない。

### Phase 7-U: Mobile-first UI Readiness

100-user Validation開始前に、`docs/UI_DESIGN_FOUNDATION.md`を基準として主要利用導線を刷新する。

- UI-0: Design Foundation、Decision、PR分割（完了）
- UI-1: Token / Primitive / Login / Confirm / Consent（完了）
- UI-2: Authenticated App Shell / Bottom Navigation / Profile（完了）
- UI-3: Bunshin Onboarding（完了）
- UI-4: Home / Today / Mission Decision・Copy・Post・Feedback（完了）
- UI-5: SOCIAL Settingsの情報設計（完了）
- UI-6: Admin Shell / Responsive / Accessibility / Final QA（完了。実端末のProduction smokeは人間確認待ち）

UI変更では既存Coreの意味、Isolation、外部Provider境界を変更しない。FREE検証開始条件へ、スマートフォンでLoginから初回投稿完了まで到達できることを追加する。

### Phase 7-C: Adaptive Content Assistance

状態: 第1段階完了。作成支援レベル、SNS別自動選択、Missionの段階表示、形式別コピー、安全なLINE要約、支援レベル別KPIを実装済み。第2段階の段階生成は利用実績と原価確認後に再判断する。

SNS、投稿方法、BUNSHINが作る範囲を分離し、利用者が必要とする支援量で今日のMissionを実行できるようにする。

- `IDEA_ONLY | GUIDED | READY_TO_USE`の作成支援レベル — Core完了
- SocialProfileの初期値とDailyMissionのsnapshot — Core完了
- SocialProfileの初期設定API/UI（日本語3択） — 完了
- SNS別投稿セットと自動選択Domain Policy（SNS・希望形式・顔／声・時間・直近形式の決定ルール完了）
- 企画、作り方、完成版の段階表示 — 完了
- 画像・動画を作るための指示文を含む形式別コピー（完了。画像制作指示と投稿文は別Activityで計測）
- 投稿本文や指示文をPushしないLINE安全要約 — 完了
- 支援レベル別Funnel、投稿完了率、AI使用量・見積原価（支援レベル別の採用・コピー・投稿・GOOD率完了）

第1段階は既存のMissionContent必須1対1aggregateとatomic生成を維持し、表示と行動計測を段階化する。AIの段階生成は利用実績と原価を確認した後の独立判断とし、画像・動画本体生成、SNS自動投稿、管理画面からの本番Prompt自由編集を含めない。

### Phase 7-D: Evidence-based Trend Research

状態: 運用コード完了。本番ProviderのAPIキー登録・接続確認・有効化と実運用評価待ち。

- 「バズ保証」ではなく、最新情報を調べた利用者向け動画企画を提供する
- 初期FREE検証は週1回、最大3候補を基本とする
- `TrendResearchPort`と交換可能なProvider Adapter
- Provider比較spike（Grok／Exa／Firecrawl共通契約・安全変換・失敗分類）: 完了。本番利用は管理画面で明示的に有効化する
- Evidence、取得日時、有効期限、適合理由を持つ候補
- Research Run / Evidence / Candidate Core Persistence — 完了
- Workspace / User / Bunshin isolationとquery最小化
- 週次冪等Job、quota、原価、期限切れ、通常Mission fallback — 完了
- Candidate Ranking / Daily Mission任意入力 — Core接続完了
- 採用Trend Candidate / Evidence snapshot — Core Persistence完了
- Mission画面の出典表示とLINE安全要約 — 完了
- トレンド調査・候補・Mission採用・投稿・鮮度・失敗・設定原価の管理指標 — 完了
- SNS無断スクレイピング、成果保証、画像・動画本体生成は含めない

### Phase 7-E: Controlled Learning / AI Agent Compatibility

状態: E0設計レビュー中。外部Agent、学習、Skill Registry、MCPは未実装。`AI_AGENT_COMPATIBILITY_REBASELINE.md`を正本候補とする。

- E0: AI／Agent互換境界、data policy、tool policy、budget、kill switch、Golden Dataset方針 — 文書完了
- Golden Dataset Core: version固定fixture、評価器、禁止結果テスト — 完了（外部接続なし）
- Golden Regression Runner: 全件集計、欠落・重複・未知ケース検出 — 完了（fixture-only）
- E1: 環境別・版管理Provider Registry（D3実測と運用要件確定後）
- E2: 既存行動から作るPreference Read ModelとLearning Proposal
- E3: 人間承認、回帰評価、rollbackを持つ変更提案
- E4: 管理されたSkill Registry（十分な行動データ確認後）
- E5: 任意のAgent Runtime Adapter（明確な品質・費用優位確認後）
- E6: allowlist MCP Gateway（外部Agent利用が必要になった後）

AI／AgentへDB、秘密情報、LINE、SNS、本番設定、任意shellを直接操作させない。既存Activity、PostRecord、Feedback、BunshinMemoryを正本とし、重複tableを先に作らない。

### Phase 7-P: 人格学習・公式商品パック

状態: P0設計レビュー中。実装コード、Prisma Schema、Migrationは未着手。`PERSONALITY_LEARNING_PRODUCT_PACK_REBASELINE.md`を正本候補とする。

- P0: 現行監査、所有権、参加同意、商品版固定、生成Context境界 — 文書レビュー
- P1: Generation Context Builder、人格Version、Memory選択、生成Snapshot
- P2: Organization所有のProduct Pack、公開Version、Rule、Asset、招待、参加、Bunshin割当
- P3: Learning Proposal、本人承認、取消、人格Version／Memoryへの安全な反映
- P4: 決定的商品ルール検査、AI意味検査、重複回避、運用画面
- P5: 十分な同意済みデータが蓄積した後の類似度・匿名集計

人格と個人Memory／Knowledgeは本人Workspaceに残し、公式商品情報はOrganization Workspace所有のProduct Packとして分離する。両者はGeneration Context Builderでのみ統合し、生成時に解決した公開Versionと参照resourceをSnapshotへ固定する。本人同意、Bunshin割当、Workspace境界が揃わない場合は生成へ利用しない。

### Phase 7-G: グループ発信

詳細は`docs/GROUP_BROADCAST_REBASELINE.md`を正本とする。

- G1: Group / Membership / Invitation / Consent / Isolation — 完了
- G2: Product Pack / Version / Rule / Asset / Assignment / 管理API・UI / Generation Context接続 — 完了
- G3-A: 本人Evidence / Advertising Classification / PR固定表記 / 固定事実照合 / 監査 — 完了
- G3-B: Daily Mission生成フローへの自動Gate接続 — 完了
- G4: 任意参加Campaign / Participation / 期間・上限・公式素材 / 管理・本人API/UI / 監査 — 完了
- G5: 投稿比率、Weekly Plan、生成、LINE/Web導線 — 完了
- G6: 類似検査、利用制限、KPI、1社先行テスト — 基盤完了（実運用検証待ち）
- G7: 検証後の承認型人格学習

Phase 7-PのProduct Packと人格学習は本Phaseへ統合する。G1〜G6を飛ばしてG7へ進まない。

### Phase 7-H: グループ機能権限

SNS、ブログ、LINE、商品パックなど今後増える機能を、管理役割とは別にGroupと参加者へ割り当てる共通基盤とする。

- H1: 拡張可能な機能カタログ、Group利用方針、参加者割当、上限、期間、監査、Isolation — 完了
- H2: システム管理者によるGroup機能設定UI — 完了
- H3: Group Managerによる参加者機能設定UI — 完了
- H3-A: システム管理者・Group Managerの招待発行、本人同意、参加導線 — 完了
- H4: Group Campaign投稿生成の共通Gate接続、日次・月次利用量の原子的記録、管理画面表示 — 完了
- H4-A: SOCIAL画像生成のProvider実行直前へ同じ共通Gateを接続 — Phase 7-IのProvider実装時
- H5: BLOG追加時のカタログ登録とBLOG固有Gate接続

Platform AdminがGroupへ許可した範囲だけをGroup Managerが参加者へ再委譲できる。管理役割、Group機能権限、Bunshin Capabilityの3層を混在させず、未設定は拒否する。

### Phase 7-I: グループ限定SNS画像生成パイロット

詳細は`docs/GROUP_SNS_IMAGE_GENERATION_REBASELINE.md`を正本とする。

- I0: 既存実装監査、限定公開、所有権、予算、Storage、Go / No-Go — 文書完了
- I1: 10テーマ方式比較と検証手順の確認 — 手順・評価票完了（テーマ、予算、評価者の確定と実査待ち）
- I2-A: Domain、状態遷移、Provider Port、Isolation Policy — 完了
- I2-B: Prisma Schema、Migration、Repository、DB一意制約、rollback手順 — 完了
- I3-A: 管理レイアウトSchema、文字・画像領域、5テンプレート、フォントライセンス方針 — 完了
- I3-B: Satori / resvg / Sharpによる決定的描画 — 完了
- I3-C: 元素材・完成画像・サムネイルの非公開Storage
- I4: OpenAI Image Adapter、Job、Usage、上限、緊急停止
- I5: 利用者API/UI、採否、再生成、download、LINE導線
- I6: Group / Platform管理、50テーマ比較、Security、Production Gate

FREE一般ユーザーへは開放せず、Productionで明示許可したGroupと同意済みACTIVE Membershipだけを対象とする。Phase 10の一般向け画像・動画Providerを前倒ししない。越境、秘密漏えい、二重課金、重大な広告安全違反が1件でもあれば全体停止する。

### Phase 7-J: 活動継続機能

状態: J0文書完了。人間レビュー前にJ1以降へ進まない。詳細は`docs/ACTIVITY_CONTINUITY_REBASELINE.md`を正本候補とする。

- J0: 現行監査、正本、行動定義、KPI、実装境界の再基準化 — 文書完了
- J1: `MissionActivity`の確認・休み行動、週間・累積Progress Read Model、冪等性、Isolation — 完了
- J2: 今日の確認、今日は休む、活動カレンダー、今週あと何回のmobile-first UX — 完了
- J3-A: 発信ステップ、版管理された達成バッジ、7日休眠判定、Web復帰表示（実装済み）
- J3-B: 既存の同意・Quiet Hours・Quota・全体停止を再利用するLINE復帰通知（実装済み）
- J4-A: 最重要KPI「初めの7日間で3回投稿」の管理レポート・CSV — 実装済み
- J4-B1: ユーザー・Group別進捗、環境別テスト利用者除外、追記型監査、集計監視、CSV — 実装済み
- J4-B2: 週間目標・休眠日数・Step・BadgeのRule Version管理画面 — 実装済み

`DailyMission`、`MissionContent`、`MissionDecision`、`MissionActivity`、`PostRecord`、`MissionFeedback`、`LineNotificationPreference`と既存LINE配信基盤を正本とする。`daily_contents`、汎用`activity_events`、`post_reports`、別系統の通知設定は作らない。週に3回の確認は優しい継続目標とし、最重要KPIは7日間に3回以上実際に投稿したユーザー率とする。

### Phase 7-L: 外部成果計測URL連携

状態: L7のIsolation自動テスト、スマートフォンE2E手順、Production Gate接続まで完了。本番実査と確認記録は運用時に行う。

- L0: 現行監査、責任分離、所有権、URL優先順位、DB／API／UI／CSV境界 — 文書完了
- L1: External System、Allowed Domain、Member Identity、Tracking Link Core、選択Policy — 完了
- L2: 管理API、URL安全検証、停止・期限切れ、監査 — 完了
- L3: Product Pack Version方針、SNS別Placement Template — 完了
- L4: Mission生成への決定的差し込み、atomic Usage Snapshot — 完了
- L5: 本人確認画面、コピー前再検証、LINE安全要約 — 完了
- L6-A: Group管理画面、設定漏れ、利用履歴、CSV出力 — 完了
- L6-B: CSV部分取込、行別検証、部分成功 — 完了
- L7: Isolation／E2E／スマートフォン／Production Gate — コード・手順完了、本番実査待ち

クリック、申込み、購入、成約、報酬、顧客、独自Cookie、短縮URL、redirect、自動投稿、外部API同期は本Phaseへ含めない。成果帰属はGroup Membership単位とし、Bunshin／人格単位にしない。

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

## Phase V: Group Video Generation

状態: コード実装完了。完成MP4へのメタデータ埋め込みは現行Phaseの完了条件から外し、利用者検証は外部チームが行う。

グループ限定の検証機能として実装する。Phase V-1の利用者検証は外部チームが担当し、本リポジトリでは実装と自動テストを担当する。

- V-0: 動画仕様の責任境界、標準動画とAI動画の分離 — 完了
- V-1: Video Project / Scene Core、Group権限、Isolation、AI利用種別 — 完了
- V-2: 動画企画・台本生成Port／Use Case、許可済みContext、OpenAI構造化出力 — 完了
- V-3: 素材管理Core、利用者素材、承認済み素材の再利用、Private Storage、署名Upload API／本人画面 — 完了
- V-4: 動画Project作成、企画・台本生成API、AI利用記録、本人確認画面 — 完了
- V-5A: 台本承認、Render受付Core、Provider Port、重複受付防止 — 完了
- V-5B1: 外部Render Provider比較、Creatomate Adapter、RenderScript変換 — 完了
- V-5B2A: Creatomate環境別設定、暗号化保存、接続確認、管理画面 — 完了
- V-5B2B: 非同期Job、進捗確認、完成物のPrivate Storage取得、本人確認導線 — 完了
- V-5B3A: 署名付きWebhook、Provider ID照合、status API再確認 — 完了
- V-5B3B: 管理者向け運用監視、安全な手動再実行 — 完了
- V-5B3C: 完成時のみ利用回数を確定、完成通知 — 完了
- V-5C1: SNS別AI開示Policy Core、環境分離、版管理、ACTIVE一意制約 — 完了
- V-5C2: AI開示Policy管理画面、動画作成時Snapshot、本人確認案内 — 完了
- V-5C2B: 動画機能の本番準備チェック、設定不足の管理者導線 — 完了
- V-5C3: 完成MP4へのMetadata埋め込み — 現行Phaseでは実装しない。必要性と互換性を再評価する場合だけ将来Phaseで扱う

標準動画は静止画・字幕・音声・BGM・文字の動きで構成し、AI動画生成を含めない。外部レンダリングから開始し、完成したRenderだけを将来の利用回数対象とする。課金・決済は本Phaseへ含めない。

## Phase 10: Publishing Provider

100人検証後に再評価する。

- SNS OAuth
- PostMesh / Ayrshare / Late等のPublishing Adapter
- 承認型自動投稿
- metrics自動取得
- Video完成物の承認後Publishing連携

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
