# Program Module 現状調査・設計提案

調査日: 2026-09-16  
対象: `bunshin-platform` main (`6c499994`)  
目的: 実装前の現状確認。本文書の作成時点ではコード、DB、migration、設定値を変更しない。

## 1. Executive Summary

Program Moduleは現在のワタシワークスへ追加可能である。ただし、ゼロから新しいProgram基盤を作るべきではない。すでに次の中核が実装済みである。

- `ProgramTemplate` / `ProgramTemplateVersion`: 共通またはサービス専用のプログラム定義と版
- `ServiceProgram` / `ProgramOffering`: サービスへの採用と提供条件
- `ProgramEnrollment`: 会員の参加と参加時スナップショット
- `ServiceProgramSupportPolicy` / `ProgramMemberPreference`: 支援方法
- `ProgramGoalDefinition` / `ProgramMemberGoal`: 目標
- Program管理画面、サービス管理画面、参加者画面、監査ログ

不足しているのは、プログラム定義を日々の実行へ変換する汎用エンジンである。現在の「90日」「Phase」「曜日別の今日の行動」は `business-growth-program.ts` と `business-growth-actions.ts` に固定され、参加開始日も主に事業プロフィール作成日から求めている。これは既存の `ProgramTemplateVersion` / `ProgramEnrollment` と接続されていない。

推奨方針は、既存Programモデル群を正本として残し、次の3要素だけを追加することである。

1. `ProgramTemplateVersion.definition` にRoute、Phase、Mission候補、遷移条件を保存する検証済みの版付き定義形式
2. EnrollmentごとのMission配信実績、選択Variant、実行状態を保存するランタイムモデル
3. Programを横断して行動を記録する追記型イベントと、そこから算出する進捗・状態・ボトルネック

既存の `DailyMission`、投稿記録、ポイント、バッジ、LINE、AI、Product Packを作り直してはいけない。Program Moduleはそれらを「誰に、いつ、何の目的で使わせるか」を決めるオーケストレーターとする。

最大の技術リスクは、既存90日機能と新しいProgram Engineが二重の開始日・Phase・Missionを持つこと、`definition` が無検証のJSONのまま拡張されること、DailyMission固有イベントとProgram横断イベントが二重計上されることである。段階的に既存90日機能をProgram Enrollmentへ接続し、一つの正本へ寄せる必要がある。

## 2. Current Architecture

### Frontend / Backend

- Next.js App Router: `apps/web/app`
- HTTP境界と入力検証: `apps/web/src/http`
- ユースケース、Repository interface、ドメイン寄りの型: `packages/application/src`
- Prisma実装: `packages/database/src`
- Prisma schema / migration: `packages/database/prisma`
- 機能別契約: `packages/capability-contract`、`packages/capability-social`、`packages/capability-fortune`
- 認証: Supabase sessionを `apps/web/src/auth/current-user.ts` で解決し、POST系は `request-security.ts` のSame Origin検証を利用

### DB / テナント境界

`Workspace` が最上位のデータ境界、`Group` が運営団体配下のサービス、`GroupMembership` が参加・運営権限の正本である。Program系モデルは `workspaceId`、`groupId`、membership、program、offeringを複合外部キーで拘束している。Program独自のユーザー・会員・企業テーブルは不要である。

### AI

- Provider設定・版・有効化: `AiProviderConfiguration`、`apps/web/src/ai/runtime-provider-configuration.ts`
- 利用記録: `AiUsageEvent`、`apps/web/src/observability/ai-usage.ts`
- Mission計画・本文・品質判定: `openai-daily-mission-planner.ts`、`openai-mission-content-generator.ts`、`openai-mission-quality-checker.ts`
- 記憶選択: `packages/application/src/memory-selector.ts`
- 生成コンテキスト固定: `GenerationContextSnapshot`
- 別案と選択履歴: `MissionContentVariant`、`MissionContentVariantGeneration`、`MissionContentVariantSelection`

### LINE / Job

- 接続、Webhook、ユーザー紐付け、Rich Menu、通知設定を実装済み
- `Job` と `/api/internal/jobs/schedule`、`/api/internal/jobs/run` によりスケジュールとWorkerを分離
- `LineMessageDelivery` / `LineMessageDeliveryAttempt` で送信、試行、失敗、再実行を記録
- `daily-mission-job-handler.ts` がMission生成、画像・動画準備、休眠判定、LINE配信Job登録を行う
- idempotency keyをMission生成、Delivery、Jobに持ち、重複実行を抑止

### Admin / Analytics

- Platform Program: `apps/web/app/(app)/admin/programs`
- Service Program: `apps/web/app/s/[serviceSlug]/manage/programs`
- Program支援・目標: `apps/web/app/s/[serviceSlug]/manage/program-goals`
- 参加者Program: `apps/web/app/s/[serviceSlug]/programs`
- 90日運用レポート: `apps/web/app/s/[serviceSlug]/manage/90-day-report`
- 共通監査: `AdminAuditLog` と `apps/web/app/(app)/admin/audits`
- Program監査: `ProgramAuditLog`
- LINE funnel / metrics、ポイント・バッジ管理、サービス利用レポートも既存画面を持つ

### Test / CI

単体・境界・schema readinessテストが各packageと `apps/web/test` に存在する。CIは `.github/workflows` から `pnpm test`、build、DB readiness等を実行する。Program追加時はWorkspace / Service / Membershipの越境拒否、冪等イベント、版固定、集計再現性が必要である。

## 3. Existing Features

| 機能               | 主なファイル / DB                                                              | API・画面                                                    | Programでの再利用                                                |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Program定義・版    | `program-core.ts`; `ProgramTemplate`, `ProgramTemplateVersion`                 | `/api/admin/programs`; `/admin/programs`                     | Programの正本。新しいProgramテーブルを作らない                   |
| サービス採用・提供 | `ServiceProgram`, `ProgramOffering`                                            | `/api/services/[serviceSlug]/programs`; service管理画面      | 企業・サービス別採用、条件、責任分界、期間                       |
| 参加               | `ProgramEnrollment`                                                            | enrollments API; service管理画面                             | GroupMembershipを参加者として利用。VersionはOffering経由で固定   |
| 支援方針・目標     | `program-goals-core.ts`; SupportPolicy、Preference、GoalDefinition、MemberGoal | `program-goals.ts`; 管理/参加者画面                          | 希望支援と成果目標。Mission typeとは別概念として保持             |
| 90日Phase          | `business-growth-program.ts`                                                   | home、90-day-report                                          | 第一号Programの内容資産として移植。汎用エンジンにはしない        |
| 今日の行動         | `business-growth-actions.ts`, `service-daily-actions.ts`                       | service home / daily action                                  | Mission template候補・実行UIとして再利用                         |
| Daily Mission      | `DailyMission`, Content、Decision、Activity、PostRecord、Feedback              | daily-missions / decision / activities / post / feedback API | SNS Missionの実行先。Program Missionは参照し、複製しない         |
| Mission別案        | `MissionContentVariant*`                                                       | variants API                                                 | Variant配信・選択の実績に利用。Program側にもdefinition keyを保存 |
| 行動継続ルール     | `activity-continuity-rules.ts`; `ActivityContinuityRule`                       | `/admin/activity-rules`                                      | 週目標、休眠日数、継続段階の初期ルール。Program別上書きが必要    |
| ポイント           | `point-core.ts`, `point-activity-processor.ts`; Point系models                  | points API / 管理画面                                        | Action Eventを既存processingへ変換。残高ロジックを再実装しない   |
| バッジ             | `badge-core.ts`, `badge-common-processor.ts`; Badge系models                    | badges API / 管理画面                                        | milestone付与とLINE通知。Program条件をrule入力へ追加             |
| LINE配信           | `line-messaging-core.ts`, `line-delivery-job.ts`; LineMessageDelivery          | webhook、retry、readiness API                                | Mission通知・深いリンク・再試行・重複防止を利用                  |
| Scheduler / Job    | `mission-automation-jobs.ts`, `job-worker.ts`, web job handlers; `Job`         | internal schedule/run                                        | Program Mission選定Jobを既存キューへ追加                         |
| AI生成             | daily mission generation、provider群、AI usage                                 | Mission生成API / Job                                         | ルール選定後の文面調整・順位付けに限定                           |
| Memory / Persona   | `memory-selector.ts`, Bunshin profile/memory                                   | memories API                                                 | 個別調整コンテキスト。企業ノウハウはGroupKnowledgeを利用         |
| Product Pack       | `product-pack.ts`; ProductPack/Version/Rule/Asset/Assignment                   | product-packs API / 管理画面                                 | Programを販売・割当する将来の権利束。Program本体と混同しない     |
| Feature制御        | `group-feature-entitlement.ts`; GroupFeaturePolicy/Usage/Audit                 | service/admin feature画面                                    | Program利用可否、AI費用の制御                                    |
| 料金設定           | `ServiceCommercialSetting`, OrganizationEntitlement                            | `services.ts`                                                | サービス料金・枠。Program決済は現状未実装                        |
| 監査               | `ProgramAuditLog`, `AdminAuditLog`, feature/LINE/group audits                  | audit画面・export                                            | 管理操作を記録。ユーザー行動イベントとは分離                     |
| 90日集計           | `business-program-report-data.ts`, `business-outcomes.ts`                      | 90-day-report                                                | 指標の初期実装として利用。Enrollment基準へ切替が必要             |

## 4. Gap Analysis

| 必要機能                                              | 分類 | 判断                                                              |
| ----------------------------------------------------- | ---: | ----------------------------------------------------------------- |
| Program、Version、サービス採用、Offering、Enrollment  |    A | 実装済み。正本として使用                                          |
| 会員・企業・権限・サービス境界                        |    A | Workspace / Group / GroupMembershipを利用                         |
| 支援モードと参加者目標                                |    A | 実装済み                                                          |
| SNS Daily Missionの生成・閲覧・採用・完了・投稿・評価 |    A | 既存モデル/API/UIを利用                                           |
| LINE送信、失敗、再試行、重複抑止、Web誘導             |    A | 既存Delivery / Job / deep linkを利用                              |
| ポイント・バッジ                                      |    A | 既存台帳・processorを利用                                         |
| Product Pack / feature entitlement                    |    A | Programの利用権・企業展開に利用可能                               |
| Program definitionの型・検証・publish時検査           |    B | JSON欄はあるが、汎用定義schemaがない                              |
| 90日開始日・PhaseをEnrollment基準へ統合               |    B | 現在は事業プロフィール作成日と固定関数に依存                      |
| Program別通知頻度・休眠・再開                         |    B | 共通休眠判定と通知設定はある。Program別policyが必要               |
| 既存Mission ActivityからProgram Eventへの投影         |    B | event素材はあるがProgram scopeと共通語彙がない                    |
| Program Mission配信/割当とVariant追跡                 |    C | 誰にどのdefinition/variantを出したかの汎用記録がない              |
| Program横断Action Event                               |    C | DailyMission専用Activityはあるが、outreach/result等を統一できない |
| Enrollmentの進捗・状態・bottleneck snapshot           |    C | 汎用状態判定がない                                                |
| rule-based Next Mission選定                           |    C | 90日固定選定はあるが、versioned definitionからの選定はない        |
| Program funnel / Mission / Version分析                |    C | 90日レポートはあるがProgram横断集計がない                         |
| Mission実験の高度な割当・統計                         |    D | V1では配信variantの記録だけ確保                                   |
| Marketplace、決済、精算、affiliate、自動投稿、ML予測  |    D | 指示書どおりV1対象外                                              |

## 5. Data Model Proposal

### 維持する正本

既存の `ProgramTemplate → ProgramTemplateVersion → ServiceProgram → ProgramOffering → ProgramEnrollment` を維持する。`Route`、`Phase`、Mission定義だけを理由に別のProgram系列を作らない。

### 既存モデルの小規模拡張

`ProgramTemplateVersion.definition` を、publish時に次の構造として検証する。DB列は当面JSONのままとし、application層にschema versionとparserを置く。

- `schemaVersion`
- `duration`: 固定日数または無期限
- `routes[]`: key、対象条件、標準route
- `phases[]`: key、順序、進入・完了条件、表示文
- `missions[]`: definition key、type (`FIXED` / `TEMPLATE`)、目的、実行先capability、候補条件、完了event
- `stateRules[]` / `bottleneckRules[]`
- `notificationPolicy`
- `resultDefinitions[]`: ProgramごとにRESULTの意味を定義

Published versionは編集せず、新版を作る。Enrollmentが参照するOfferingから実行Versionを一意に追える現行relationを維持する。

### 新規が必要なランタイムモデル案

名称は実装時に既存命名規約へ合わせる。

1. `ProgramMissionAssignment`
   - `workspaceId`, `groupId`, `programEnrollmentId`
   - `programTemplateVersionId`
   - `routeKey`, `phaseKey`, `missionDefinitionKey`, `variantKey`
   - `targetResourceType`, `targetResourceId`（例: DailyMission）
   - `status`（提示、開始、完了、skip等）、提示/開始/完了日時
   - 配信時のMission表示情報とrule versionのsnapshot
   - Enrollment + definition + sequence/idempotencyの一意制約

2. `ProgramActionEvent`
   - 追記型
   - Enrollment、MissionAssignment、actor、occurredAt
   - `eventType` は固定enumを急がず、検証済み文字列key + schema versionを推奨
   - source resource type/id、idempotency key、metadata
   - `MISSION_COMPLETED`、`CONTENT_PUBLISHED`、`RESULT_REPORTED`等をProgram定義へ対応付ける

3. `ProgramProgressSnapshot`
   - Enrollmentごとに現在のroute/phase/state/bottleneck、最終行動、休止日時、算出rule version、算出日時
   - eventから再計算可能なキャッシュ。履歴の正本はevent

`ProgramEnrollment.status` は契約・参加ライフサイクルであり、ACTIVE/INACTIVE等の行動状態に流用しない。休止・再開はeventとprogress snapshotで表し、利用資格を失わせない。

DailyMissionの本文、Decision、PostRecord、Feedbackは既存モデルを使う。Program Mission Assignmentはそれらを参照するだけにする。Mission variant keyは配信時に必ず固定し、後からA/B比較できるようにする。

## 6. Program Engine Proposal

1. Enrollmentと固定されたProgram Versionを取得
2. Event履歴と現在snapshotを読み込む
3. versioned ruleでRoute、Phase、State、Bottleneckを決定
4. 条件を満たすMission候補を列挙
5. 禁止事項、権限、feature entitlement、期限、直近履歴で候補を絞る
6. ルールで一意ならそのまま選択。複数の場合だけAIによる順位付けを許可
7. `ProgramMissionAssignment` を冪等作成
8. capability adapterで既存DailyMission、入力フォーム、教材、画像、動画等の実行先を準備
9. LINEは短い通知とWebリンクだけを配信
10. 完了時にsource eventを一度だけProgram Action Eventへ投影し、progressを再計算

RouteとPhaseはV1ではVersion定義内の構造でよい。独立した管理、検索、他Program間共有が必要になるまでテーブル化しない。StateとBottleneckはProgramごとに結果条件が異なるため、共通enumよりversioned ruleの派生ラベルが適する。

既存副業90日は、固定配列を一度Program Version定義へ変換し、既存UIの見た目を維持したまま、開始日を `ProgramEnrollment.startsAt`、現在PhaseをEngineから取得する。切替期間中に旧計算と新計算を同時に正本化してはいけない。

## 7. AI Integration Proposal

AIはProgramルールを決めない。次の範囲に限定する。

- 許可済みMission候補の順位付け
- `TEMPLATE` Missionの文章、例、手順をプロフィールやMemoryに合わせて調整
- 既存Mission本文・画像・動画の生成
- 管理者向けにbottleneckの説明文を作る

ルール側が担うもの:

- 参加資格、Phase遷移、完了条件、RESULT条件
- 禁止Mission、必要capability、費用上限、通知可否
- 候補なし・AI失敗時の固定fallback
- eventからのstate/bottleneck算出

既存Provider設定、利用量記録、prompt version、GenerationContextSnapshot、Memory selectorを使う。Program選定には `programTemplateVersionId`、Mission definition/variant、rule version、候補一覧、選択理由を観測情報として保存する。AIが候補外のMission keyを返した場合は拒否し、固定候補へfallbackする。

## 8. LINE Integration Proposal

既存のMission通知経路を拡張する。

- schedulerがProgram Engineを呼び、assignmentを確定
- `LineMessageDelivery` にProgram Mission向けkindまたはmetadataを追加
- 通知は「今日やること」とWeb deep linkを中心にする
- Web表示時にassignmentを記録し、開始・完了をevent化
- 既存のidempotency、attempt、retry、readiness、connection、notification consentを利用
- 休眠判定は既存 `ActivityContinuityRule.dormancyDays` を初期値とし、Program Versionのpolicyで通知頻度だけを変更
- 休眠してもEnrollmentを取消さない。再開リンクで新しいMissionを提示する

配信失敗はProgram進捗失敗として扱わず、Deliveryの運用状態として分離する。通知が届かなかった利用者を「行動しなかった」と判定しない。

## 9. Admin Proposal

既存Program管理画面を段階的に拡張する。

1. Platform管理: Program Version、Route/Phase/Mission定義、publish前検証
2. Service管理: Program採用、表示名、提供期間、支援方針、Program別通知policy
3. 参加者管理: Enrollment、現在Phase/State/Bottleneck、最終行動、次のMission、休眠/再開
4. 分析: Version、Route、Phase、Mission、cohort別funnel

既存Program CRUDと90日レポートを入口にし、別の管理体系を作らない。管理操作は `ProgramAuditLog`、platform横断操作は既存Admin auditへ残す。自動判定の根拠にはrule versionと使用eventを表示できるようにする。

## 10. User UX Proposal

副業初心者向けの最小画面は次の順序とする。

1. 大見出し「今日やること」
2. 一つの具体的な行動
3. 所要時間と、やる理由を一文
4. 大きな開始ボタン
5. 3段階程度の手順
6. 「できた」「今日は休む」「助けが必要」

Route、Phase、State、Bottleneck、AI判定、スコアは利用者画面に露出しない。進捗は「90日中○日」よりも「今は○○を整える時期です」のような平易な補足にする。完了後はポイント・バッジと次回案内を短く表示する。複雑な入力は既存の投稿支援、商品候補、成果報告など目的別画面へ移す。

## 11. Analytics Proposal

分析の正本は `ProgramActionEvent` とMission Assignmentである。状態は次のようにProgram Versionのruleで派生させる。

- REGISTERED: Enrollment作成
- STARTED: 最初のMission開始/完了
- ACTIVE: 定義期間内の有効行動と継続条件
- MARKET: Programがmarket actionに分類したevent
- RESPONSE: 第三者反応event
- RESULT: Program固有result definitionを満たすevent
- REPEAT: RESULTが再発
- INACTIVE: 最終有効行動からProgram所定日数経過

ログインや閲覧は補助指標でありACTIVEの主要条件にしない。DailyMission Activity、PostRecord、business outcome、画像・動画生成、外部成果などをadapterで共通eventへ一度だけ投影する。

最低限の集計:

- Enrollment数、開始率、ACTIVE率、休眠/再開率
- Assignmentの提示、開始、完了、skip、help
- Phase到達率と所要日数
- MARKET / RESPONSE / RESULT / REPEAT到達率
- Program Version、Route、Mission definition/variant、参加cohort別比較

ポイント残高やバッジ数をProgram成果の代用にしない。ポイント・バッジは動機付け、Action Eventは行動事実、Program stateはruleによる評価として責務を分ける。

## 12. Package Expansion

共通Program Templateはplatform ownership、企業専用は `ownerGroupId` 付きPRIVATE templateとして表現できる。企業は公開Versionを `ServiceProgram` として採用し、Offering、SupportPolicy、Goal、通知、ブランド、GroupKnowledgeを自社向けに設定する。

Product PackはProgramそのものではなく、Program参加権、feature、教材、画像・動画枠などを束ねる販売・割当単位として使う。将来はProductPackRule/AssetからServiceProgramまたはOfferingへの参照を追加する余地がある。企業ごとのコピーはTemplate/Versionの出所を保持し、published versionを直接編集しない。

これにより副業、集客、代理店育成、営業育成、スクール、会員育成、占いを同じEngineで動かしながら、RESULT定義、Mission群、期間、通知、支援内容だけをVersionで変更できる。

## 13. V1 Scope

### Must

- Program definition schema v1とpublish時検証
- 既存副業90日をVersion定義へ表現
- Enrollment基準の開始日・進捗
- Mission Assignmentとvariant/source resource追跡
- 追記型Program Action Eventと冪等性
- rule-based Phase / State / Bottleneck / Next Mission
- 既存DailyMission・投稿・成果報告とのadapter
- LINEによる今日のMission通知とWeb完了計測
- 休眠・再開。強制退会なし
- Program/Version/Mission別の最小funnel

### Should

- AIによる許可候補の順位付けとTEMPLATE調整
- Program別通知policy
- ポイント・バッジとの共通event連携
- 管理者による参加者進捗・停止理由の確認
- 配信variant記録とCSV/export

### Later

- 高度な実験割当・有意差分析
- DYNAMIC Mission
- Product Packとの自動販売・checkout連携
- Program複製workflow、マーケットプレイス
- 成功予測、推薦学習、自動価格最適化
- 案件、報酬、affiliate、SNS自動投稿、コミュニティ

## 14. Implementation Plan

### Phase 0: 事業定義の確定

- 副業90日のRESULT、MARKET、RESPONSE、REPEATを具体的eventへ定義
- 「完了」の自己申告範囲、休眠日数、再開挙動を決定
- V1のMission一覧、FIXED/TEMPLATE、完了条件を確定

### Phase 1: Versioned Definition

- application層にdefinition schema/parser/validatorを追加
- 既存90日Phase・行動を定義データへ変換
- publish時検証と管理画面の読み取り表示

依存: 既存Program Template/Version。DB migrationは原則不要。

### Phase 2: Runtime Tracking

- Mission Assignment、Action Event、Progress Snapshotを追加
- Workspace/Group/Enrollment/Versionの複合制約
- idempotent projectorと再計算処理

依存: Phase 1。ここで初めてmigrationが必要。

### Phase 3: Side-hustle 90-day Integration

- business profile日付からEnrollment開始日へ切替
- 既存DailyMission・daily action・business outcomeをProgram eventへ接続
- 既存利用者のEnrollment/開始日移行方針を実施

依存: Phase 2。旧ロジックは切替確認後に削除。

### Phase 4: LINE and UX

- Program assignmentを既存Job/Deliveryへ接続
- 「今日やること」画面、完了、休む、助けが必要、再開
- 通知頻度と休眠policy

依存: Phase 3。

### Phase 5: Analytics / Admin

- funnel、Phase、Mission、Version、cohort集計
- 参加者進捗・bottleneck・次のMission表示
- 既存90日レポートをProgram集計へ段階移行

依存: 安定したevent記録。

### Phase 6: AI and Package Expansion

- 許可候補内のAI順位付け、TEMPLATE調整、fallback
- Product Pack/feature entitlementとの配布連携
- 2つ目のProgramで汎用性を検証

## 15. Risks / Questions

### 事業側で決定が必要

1. 副業90日のRESULTは「初収益の自己申告」「入金」「受注」のどれか。
2. MARKET、RESPONSE、REPEATへ数える具体的行動と、自己申告を許す範囲。
3. Missionを「完了」とする証拠。ボタン、URL、成果物、外部連携の優先順位。
4. 休眠日数、休眠中のLINE頻度、再開時に続きから進むか再診断するか。
5. 複数Routeの選択者。本人、運営者、rule、AIのどれが決めるか。
6. 90日終了後の扱い。完了、次cycle、別Program、無期限フォロー。
7. V1でポイント・バッジをProgram共通ruleへ接続する範囲。

### 技術的リスク

- 旧90日ロジックとProgram Engineの二重運用による開始日・Phase不一致
- 無検証JSON定義による公開後の実行不能。publish時の厳格検証が必須
- DailyMission ActivityとProgram Action Eventの二重計上。source/idempotencyを固定する
- 状態enumの早期固定。ProgramごとにRESULTが異なるため定義駆動を優先する
- Eventだけを毎回全件集計した場合の性能。snapshotはキャッシュとして導入する
- AIを先に導入すると判定再現性が失われる。rule engineを先に完成させる
- 既存参加者の開始日・履歴移行。自動推測せず、移行ruleと監査を残す
- 通知失敗を非活動と誤判定しないこと

### 仕様書と現実装の差

- Program基盤は「新規追加予定」ではなく、すでに相当部分が実装済みである。
- 現在の副業90日相当機能はProgram基盤上ではなく、サービス用固定ロジックとして存在する。
- `MissionActivity` はSNS DailyMission専用であり、Program横断eventではない。
- Product Pack、料金枠、feature entitlementはあるが、Programの公開checkoutや精算はない。
- 添付指示書は見出し「23. 今回やってはいけないこと」で本文が終了している。本調査では、それ以前の明示事項である「実装しない」「migrationを実行しない」「既存機能を再実装しない」を遵守した。

### 実装開始前の推奨承認点

最初に承認すべき設計は「既存Programモデル群を正本とし、versioned definition + assignment + action event + progress snapshotだけを加える」である。この判断が確定する前に、新しいProgram/Route/Phaseテーブル群や第二のMission基盤を作るべきではない。
