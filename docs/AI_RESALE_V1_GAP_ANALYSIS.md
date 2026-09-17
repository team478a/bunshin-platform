# ワタシワークス AI物販V1 現状仕様調査・差分分析

- 調査日: 2026-09-18
- 調査対象: `origin/main` / `a40aff1f`
- 調査範囲: コード、Prisma schema・migration、Application Service、API、画面、Job、LINE、AI、管理画面、既存テスト
- 実装変更: なし。本書以外のコード、DB、API、UI、LINE、課金、Promptは変更していない。

## ダウンロード

- [PDF版](downloads/ワタシワークス_AI物販V1_現状仕様調査・差分分析.pdf)
- [Word版](downloads/ワタシワークス_AI物販V1_現状仕様調査・差分分析.docx)

## 1. Executive Summary

AI物販V1は、現在のワタシワークスを捨てて別システムとして作る必要はない。Programの定義・採用・Offering・Enrollment、Action提示履歴、追記型Event、進捗Snapshot、公開登録、LINEマルチサービス接続、Job再試行、AI Provider設定・使用量記録、サービス別ブランド・規約は既に存在する。

ただし、これらはまだ1本の実運用フローとして接続されていない。特に次の5点が不足している。

1. 公開登録完了から無料7日Program Enrollmentを自動作成する接続
2. 登録日と実行結果から次のActionまたはWAITを決めるルールエンジン
3. 商品の出品・反応・改善・販売を構造化して保持するAI物販固有モデル
4. Program Action向けの画面・API・LINE通知・運営タイムライン
5. 90日一括決済、購入記録、Webhook、返金、期限連動

基盤の再利用可能度は概算で約60%だが、ユーザーが登録して7日体験を終え、購入し、90日間Actionを受け取るエンドツーエンドの完成度は約20%である。決済を手動運用にすると、検証開始に必要な追加量は大きく減る。

推奨方針は、既存`ProgramMissionAssignment`をAction提示の正本、`ProgramActionEvent`を実行・結果の正本、`ProgramProgressSnapshot`を再計算可能な現在状態として使うこと。既存`DailyMission`はSOCIAL投稿文が必要なActionの実行先としてだけ関連付ける。AI物販専用のMissionシステムは作らない。

分類の意味は次のとおり。

| 分類 | 意味                 |
| ---- | -------------------- |
| A    | そのまま利用可能     |
| B    | 軽微な変更で利用可能 |
| C    | 既存機能の拡張が必要 |
| D    | 新規実装が必要       |
| E    | V1では不要           |

## 2. 現在のシステム構成

| 領域     | 現在の構成                                                                                                   | 主な根拠                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Frontend | Next.js App Router、React、TypeScript。公開サービス画面と管理画面を同一Webアプリで提供                       | `apps/web/app`                                                                                |
| Backend  | Next.js Route Handler。Zod入力検証、Application Service、Prisma Repositoryの順で処理                         | `apps/web/src/http`, `packages/application/src`, `packages/database/src`                      |
| Database | PostgreSQL / Prisma。Workspaceを所有境界、Groupを運営サービス境界として保持                                  | `packages/database/prisma/schema.prisma`                                                      |
| Auth     | Supabase session、LINE Login、Workspace/Group Membershipによる認可                                           | `apps/web/src/auth`, `packages/auth`                                                          |
| AI       | Provider設定をDB管理し、OpenAI等をAdapterから呼ぶ。モデル、Prompt Version、token、原価、処理時間、成否を記録 | `apps/web/src/ai/runtime-provider-configuration.ts`, `apps/web/src/observability/ai-usage.ts` |
| LINE     | 共通LINEとGroup専用LINE、Webhook routing、通知同意、quiet hours、Job、失敗履歴、再送、リッチメニュー         | `GroupLine*`, `LineMessageDelivery*`, `ServiceLineBroadcast*`                                 |
| Payment  | サービスの課金方式と月額表示、Program Offeringの価格参照欄のみ。実決済は外部責務                             | `ServiceCommercialSetting`, `ProgramOffering`                                                 |
| Admin    | Platform管理、運営団体、サービス、Program、LINE、参加者、運用レポート等                                      | `apps/web/app/(app)/admin`, `apps/web/app/s/[serviceSlug]/manage`                             |
| Program  | Template → Version → ServiceProgram → Offering → Enrollment。RuntimeはAssignment → Event → Snapshot          | `packages/application/src/program-*`, Prisma Program models                                   |
| Mission  | SOCIAL固有の`DailyMission`と、Program共通の`ProgramMissionAssignment`が存在                                  | Prisma `DailyMission`, `ProgramMissionAssignment`                                             |

依存方向は概ね`apps/web → application/capability → database adapter`で、LINE・OpenAI等のProviderはWeb側Adapterへ分離されている。AI物販固有の処理も同じ境界を守る必要がある。

## 3. 既存機能一覧

AI物販V1で利用価値が高い既存機能は次のとおり。

- 公開・承認制・招待制・停止中を持つサービス登録
- 規約・プライバシーポリシーの版管理と同意履歴
- `REGISTRATION_COMPLETED`、`FIRST_SERVICE_USE`等の会員イベント
- Program Template、版管理、サービス採用、Offering、Enrollment
- 固定期間、Phase、Mission、成果定義を持つProgram Definition V1
- Enrollment単位のAction提示、開始、完了、スキップ、Event、進捗Snapshot
- SOCIAL Daily Missionの閲覧・採用・実行結果・投稿・反応記録
- 「休む日」の既存表示と`RESTED`活動
- 最終活動を使った休眠判定と復帰Reminderのcooldown
- LINE通知同意、時間帯、頻度、一時停止
- 共通LINEと運営団体別LINE、Group単位Webhook routing
- LINE配信履歴、attempt、Job retry、管理者再送
- Service LINE Broadcastの予約、対象者固定、個別本文、失敗者再送
- サービス別名称、ロゴ、色、運営者、問い合わせ先、規約、独自ドメイン
- AI Providerの設定・検証・切替、Prompt Versionと利用量記録
- Program別目標、支援モード、生成ContextへのEnrollment反映
- 参加者、Mission、投稿、成果、ポイント、バッジの既存運用レポート

## 4. Gap Analysis

| 機能                          | 現在の実装                                                               | AI物販V1で必要な仕様                        | 分類 | 必要な変更                                                                           | 関連ファイル                                                   | 関連DB                                                                | 関連API                                      |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- | ---- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| 公開無料登録                  | Serviceを`PUBLIC`にすると規約同意後にMembershipを`ACTIVE`化              | LINE等から誰でも無料登録                    | A    | AI物販用Service設定と導線のみ                                                        | `service-participation.ts`, `public-service.ts`                | `ServiceRegistrationPolicy`, `GroupMembership`, `ServiceLegalConsent` | `POST /api/services/{slug}/participation`    |
| 登録日起点                    | 登録完了EventとMembership作成・同意時刻を保存                            | DAY1からDAY7を登録日で進行                  | A    | Programの開始日の正本を`ProgramEnrollment.startsAt`に統一                            | `service-participation.ts`                                     | `ServiceMembershipEvent`, `ProgramEnrollment`                         | 既存参加API                                  |
| 無料Program自動Enrollment     | 現行は管理者が無料・招待制Offeringへ手動割当                             | 登録直後に7日体験へ自動参加                 | C    | `REGISTRATION_COMPLETED`を起点に冪等作成するUse Case/Jobを接続                       | `apps/web/src/http/programs.ts`                                | `ProgramEnrollment`, `ProgramAuditLog`                                | 現行enrollment APIは管理者用。自動経路が必要 |
| 7日固定進行                   | Definitionは固定日数を持つがMission scheduleは曜日のみ。Runtime未接続    | DAY1〜DAY7を未実行でも暦日で進める          | C    | `startsAt`からProgram dayを算出し、日次評価するorchestratorを追加                    | `program-definition.ts`, `program-runtime.ts`                  | `ProgramEnrollment`, `ProgramProgressSnapshot`                        | Runtime API/Jobなし                          |
| DAY7判定                      | Assignment/Event/Snapshotは保存できるが分類ruleなし                      | NOT_STARTED / PARTIAL / LISTED              | C    | Eventを集計する純粋ruleと判定Event/Snapshot更新                                      | `program-runtime.ts`                                           | `ProgramActionEvent`, `ProgramProgressSnapshot`                       | DAY7評価Job/APIが必要                        |
| Program Definition            | duration、phase、mission、resultをversioned JSONで検証                   | AI物販のAction、7日・90日phase、結果定義    | B    | AI物販Preset追加。日付/状態トリガー表現はV2拡張                                      | `program-definition.ts`, `program-definition-presets.ts`       | `ProgramTemplateVersion.definition`                                   | 既存Program管理APIを再利用                   |
| Action提示履歴                | Assignmentが定義key、表示snapshot、対象resource、rule versionを保持      | 何をいつ提示したか保存                      | A    | そのまま使用                                                                         | `program-runtime.ts`                                           | `ProgramMissionAssignment`                                            | 現在Web API未接続                            |
| Action開始・完了・スキップ    | Runtimeが状態遷移とEventを同一transactionで保存                          | 実行/未実行/完了日時                        | A    | そのまま使用し、画面/APIだけ接続                                                     | `program-runtime.ts`, Prisma repository                        | `ProgramMissionAssignment`, `ProgramActionEvent`                      | 新しいRuntime endpointが必要                 |
| Next Best Action              | 現行90日SNSはPhase×曜日の固定関数                                        | 現在状態から1件のActionまたはWAITを決定     | C    | 共通orchestratorとAI物販固有ruleを追加                                               | `business-growth-actions.ts`は参考のみ                         | Runtime 3 tables                                                      | 評価/取得APIが必要                           |
| Action種別                    | Definitionのkey/capabilityは文字列で拡張可                               | ITEM_FIND等9種                              | B    | AI物販Action catalogと入力validatorを追加                                            | `program-definition.ts`                                        | Definition JSON                                                       | Program管理APIのpreset追加                   |
| WAIT                          | SNSにREST表示と`RESTED`はあるがProgram上の非作業Action semanticsなし     | 完了操作不要の正式なWAITと理由              | C    | `NO_ACTION`/WAITの提示・自動消化・翌日再評価規則を定義                               | `business-growth-actions.ts`, runtime                          | Assignment/Event/Snapshot                                             | Action取得API                                |
| 最終行動日時                  | Snapshotに`lastActionAt`、Membershipに`lastUsedAt`、Mission Activityあり | PAUSED判定の基準                            | A    | Programでは`ProgramActionEvent`から更新する                                          | runtime, service participation                                 | `ProgramProgressSnapshot`, `GroupMembership`, `MissionActivity`       | なし                                         |
| PAUSED判定                    | SOCIAL向けdormancy ruleと復帰Reminderあり                                | Program固有の無活動日数でPAUSED             | C    | Program eventを使う判定ruleと状態遷移を接続                                          | `activity-continuity-rules.ts`, `daily-mission-job-handler.ts` | `ActivityContinuityRule`, Program Runtime                             | 評価Jobが必要                                |
| RECOVERY                      | LINEのReminderはあるが提示ActionはDailyMission限定                       | 小さい復帰Actionを提示                      | C    | PAUSED ruleからRECOVERY Assignmentを作る                                             | 同上                                                           | Runtime tables                                                        | Action/通知API・Job                          |
| 実行結果4択                   | SOCIAL Missionに「できた/一部/できない/助けが必要」がある                | Action結果入力と次回調整                    | B    | Program Runtime transition metadataへ同じ語彙を移植                                  | `service-daily-missions.ts`, `service-generation-knowledge.ts` | `MissionActivity`, `ProgramActionEvent`                               | Program Action result endpoint               |
| 商品の正本                    | 商品、出品、反応、改善、販売を1商品単位で持つmodelなし                   | 対象商品とライフサイクルを構造化            | D    | AI物販Capability固有の`ResaleItem`相当を追加                                         | 該当なし                                                       | 新規候補                                                              | 商品登録・更新API候補                        |
| Personal Result Data          | Event metadataとsource resource参照は可能                                | 提示→実行→商品結果を追跡                    | C    | Assignment/Eventを正本にし、商品modelへresource参照。metadata schemaをAction別に検証 | `program-runtime.ts`                                           | Runtime tables + `ResaleItem`候補                                     | Action/Event API                             |
| note用イベント                | 任意event type、source、時刻、metadataを追記保存可                       | FIRST_LISTING等を失わず保存                 | B    | Event catalog、重複防止key、発火条件を定義                                           | `program-runtime.ts`                                           | `ProgramActionEvent`                                                  | 内部Use Caseのみ                             |
| SOCIAL投稿文                  | DailyMission生成、結果、投稿記録、生成Contextがある                      | 出品説明やSNS告知が必要な場合だけ生成       | B    | ActionからSOCIAL capabilityへtarget resourceとして接続                               | `capability-social`, `daily-mission-generation.ts`             | `DailyMission`一式                                                    | 既存Daily Mission API                        |
| LINE紐付け                    | 共通/Group専用のConnection、友だち状態、同意を保持                       | AI物販参加者へ通知                          | A    | AI物販ServiceのLINE設定                                                              | LINE auth/webhook files                                        | `GroupLineConnection`, `LineConnection`                               | 既存LINE auth/webhook                        |
| 状態別LINE通知                | DailyMission通知と任意Broadcastはある                                    | ACTION/WAIT/RECOVERY/EVENTの個別通知        | C    | Program event起点scheduler、template、Program deep linkを追加                        | LINE jobs, service broadcast                                   | Broadcast/Recipientまたは汎用Delivery拡張                             | 内部scheduler、必要なら管理API               |
| LINE通知履歴・失敗・再送      | 配信、attempt、Job、retry、失敗categoryあり                              | 運用監視と再送                              | A    | Program通知も同じ実行基盤を通す                                                      | `line-messaging-core.ts`, broadcast job                        | Delivery/Attempt/Recipient                                            | 既存retry API                                |
| LINE頻度制御                  | Daily/weekday、quiet hours、pausedUntil、reminder opt-in                 | Program別頻度と過剰通知防止                 | C    | Service/Program topic preferenceと優先度・cooldownを適用                             | notification preference files                                  | `LineNotificationPreference`, `ServiceNotificationPreference`         | 既存設定API拡張                              |
| LINE deep link                | DailyMission専用署名state、Service URL、リッチメニュー                   | 現在のProgram Actionを開く                  | C    | resourceをDailyMissionに固定しないProgram Action用署名state                          | `line-messaging-core.ts`                                       | `MissionDeepLinkState`はDailyMission FK必須                           | Program deep-link endpoint                   |
| 90日一括決済                  | Stripe SDK・checkout・payment transaction・Webhookなし                   | 29,800円/9,800円を一括購入                  | D    | Provider port、Stripe adapter、Product/Price mapping、checkout、Webhook、監査        | 該当なし                                                       | 新規Purchase/Payment/Webhook候補                                      | 新規checkout/webhook                         |
| 無料→有料                     | Offering/Enrollmentはfree/price reference/期間を持つ                     | DAY7後に有料90日へ切替                      | C    | 購入成功で有料Offering Enrollment/Entitlementを冪等付与                              | `program-core.ts`                                              | Offering/Enrollment + Purchase候補                                    | Payment webhookから内部Use Case              |
| 有効期限・失効                | EnrollmentにendsAtとEXPIREDがあるが自動失効Jobなし                       | 購入日から90日で失効                        | C    | endsAt設定、期限Job、画面ガード                                                      | Program core/runtime                                           | `ProgramEnrollment`                                                   | 内部Job                                      |
| キャンセル・返金              | Program決済としてはなし                                                  | CANCELLED、返金、利用停止の整合             | D    | Payment state machineと監査。Enrollmentとは分離                                      | 該当なし                                                       | Payment候補 + Enrollment                                              | webhook/admin API                            |
| 手動権限付与                  | 管理者がProgramへ手動Enrollment可能                                      | 紹介参加権の手動運用                        | A    | 有料Offeringも管理画面で扱えるようにする場合は軽微拡張                               | Program管理画面                                                | `ProgramEnrollment`                                                   | 既存enrollment APIは無料限定                 |
| ユーザーAction画面            | Program画面は支援モード・目標表示のみ                                    | 今日の1Action、WAIT、入力、結果             | D    | Program Runtimeを読むスマホ画面を新設                                                | `app/s/[serviceSlug]/programs`                                 | Runtime + ResaleItem                                                  | Runtime API                                  |
| DAY7/購入画面                 | なし                                                                     | 状態別説明、購入しない理由、monitor提示     | D    | 状態別offer UIと理由記録                                                             | 該当なし                                                       | Offer decision/purchase reason候補                                    | 新規API                                      |
| 管理指標                      | SNS90日、参加者、運用CSVはある                                           | DAY1/DAY3/DAY7/購入/販売/PAUSED等           | C    | Program Eventsの集計query/exportを追加                                               | reports/export files                                           | Runtime/Event/Purchase/Item                                           | 管理report API                               |
| 個人タイムライン              | Event保存はあるが画面・queryなし                                         | 登録から販売まで時系列表示                  | C    | Membership Event + Program Event + Paymentを統合投影                                 | Program runtime/report                                         | 複数event tables                                                      | 管理timeline API                             |
| AI Provider                   | DB設定、モデル切替、接続確認、Adapterあり                                | Action文面生成                              | A    | 既存Providerを利用                                                                   | runtime provider config                                        | `AiProviderConfiguration`                                             | 既存管理API                                  |
| AI観測性                      | model/prompt/token/cost/latency/statusを保存                             | 文面生成の監査                              | A    | 新task typeで記録                                                                    | `ai-usage.ts`                                                  | `AiUsageEvent`                                                        | 内部                                         |
| Program Prompt                | 各Provider fileにPrompt定数・本文が埋め込まれている                      | Program/Action別instruction・tone・禁止表現 | C    | Program版設定またはversioned Prompt registryを追加                                   | `apps/web/src/providers/openai-*.ts`                           | Definition/新Prompt config候補                                        | 管理APIはV1不要                              |
| AI fallback                   | Provider例外処理や一部fallbackはあるが共通Program文面fallbackなし        | AI失敗時もActionを表示                      | B    | ルール側の固定文を必須fallbackにする                                                 | provider/service files                                         | AI usage event                                                        | 内部                                         |
| Tenant/Brand                  | Workspace→Group→Service、Brand/Legal/Domainあり                          | OEMの組織・ブランド境界                     | A    | 既存境界を使用                                                                       | services/settings files                                        | Workspace/Group/Service*                                              | 既存service API                              |
| Program追加                   | Platform/private TemplateとService採用がある                             | 他の90日Programへ横展開                     | B    | 固有rule実装のregistryを追加                                                         | Program files                                                  | Program models                                                        | Program管理API                               |
| LINEマルチテナント            | SHARED/DEDICATED/DISABLED、Group別Channel/Webhook                        | OEM別LINE                                   | A    | 通知templateのTenant化は別途C                                                        | group line files                                               | `GroupLine*`                                                          | 既存Group LINE API                           |
| 決済マルチテナント            | seller/paymentOwnerの責任区分だけ存在                                    | 販売主体別Stripe口座                        | D    | V1では単一販売者。将来Connect adapter                                                | Program Offering                                               | Payment新規                                                           | 将来                                         |
| note自動生成・投稿            | なし                                                                     | V1対象外                                    | E    | Eventを残すだけ                                                                      | Program runtime                                                | `ProgramActionEvent`                                                  | なし                                         |
| 高度BI/自由AI判断/Market Data | なし                                                                     | V1対象外                                    | E    | 実装しない                                                                           | なし                                                           | なし                                                                  | なし                                         |

## 5. Program / Mission詳細分析

### 5.1 Programの正本

現在の正本は次の流れである。

```text
ProgramTemplate
  → ProgramTemplateVersion.definition
  → ServiceProgram
  → ProgramOffering
  → ProgramEnrollment
  → ProgramMissionAssignment
  → ProgramActionEvent
  → ProgramProgressSnapshot
```

Template/Versionは内容の版、ServiceProgramは運営サービスによる採用、Offeringは価格・責任主体・条件のsnapshot、Enrollmentは参加者と開始・終了期間を固定する。Runtimeの3モデルは2026-09-17に追加済みで、複合外部キー、冪等key、状態時刻check、RLS有効化を持つ。

### 5.2 Runtimeの現状

`ProgramRuntimeService`と`PrismaProgramRuntimeRepository`は存在し、Actionの提示、START/COMPLETE/SKIP、任意Event、Snapshot更新を行える。状態遷移とEvent作成は同一transactionである。

しかし`apps/web`から`ProgramRuntimeService`を呼ぶ本番API、画面、日次Jobはない。現行Program画面はEnrollment、支援モード、目標だけを扱う。したがってDB基盤はA、実運用接続はCである。

### 5.3 SOCIAL DailyMissionとの関係

`DailyMission`はSOCIAL専用で、format、topic、投稿本文、投稿結果、SNS profileを持ち、1 Bunshin・1日1件の一意制約がある。AI物販の全Actionをここへ格納すると、次の問題が起きる。

- 商品発送やWAITまでSNS Missionになる
- 複数Programまたは複数Actionを同日に扱えない
- 商品の状態がSNS投稿データへ混ざる
- Capability境界を破る

よって`ProgramMissionAssignment`を共通Actionの正本にする。LISTで出品説明やSNS文面が必要な場合だけ、Assignmentの`targetResourceType/Id`からDailyMission等を参照する。

### 5.4 ResultとHistory

既存SOCIALにはMissionActivity、PostRecord、MissionFeedback、Business Outcomeがある。Program側には追記型Action Eventがある。AI物販では次の分担が適切である。

- Assignment: 何を提示したか
- Assignment transition/Event: ユーザーが何をしたか
- AI物販商品model: 商品の現在状態、出品・反応・販売の業務データ
- Program Action Event: FIRST_LISTING、PAUSED等の時系列事実
- Snapshot: 現在の判定状態と次Actionを高速に読むキャッシュ

## 6. Next Best Action実現方法

### 案A: DailyMissionをAI物販へ拡張

DailyMissionに商品ActionやWAITを追加し、現在のMission UIとLINEをそのまま使う案。

利点:

- 既存画面とLINEに早く載せられる
- 実行結果4択を再利用しやすい

問題:

- SOCIAL固有モデルに物販・発送・販売状態が混ざる
- 1日1件制約とBunshin依存がProgram横展開を制限する
- Program Runtimeと二重の正本になる

### 案B: Program Runtimeを正本にし、固有Capabilityへ委譲する

共通のorchestratorがEnrollment、Definition、Snapshot、Eventを読み、Program固有Policyへ判定を委譲する。

```text
Program Action Orchestrator
  ├─ 共通: 期間、Enrollment、冪等性、Assignment/Event/Snapshot
  └─ AI_RESALE_V1 Policy
       ├─ 7日: 登録日起点のDAY rule
       ├─ 90日: item状態・最終行動・経過時間のrule
       └─ output: actionKey / WAIT / reason / target / display data
```

ActionがSNS生成を必要とするときだけSOCIAL Capabilityを呼び、商品状態はAI物販Capability側で保持する。

### 推奨

案Bを推奨する。既に追加されたProgram Runtimeを活かし、DailyMissionの正本性とSOCIAL境界を壊さないためである。

V1では汎用DSLやノーコードルールビルダーを作らない。`AiResaleV1Policy`のようなTypeScriptの純粋関数で、入力schema、rule version、優先順位、結果を明示する。共通orchestratorとのinterfaceだけ固定する。

推奨優先順位例:

1. 販売済み未発送 → SHIPPING
2. PAUSED → RECOVERY
3. 商品未選択 → ITEM_FIND
4. 商品選択済み・写真なし → PHOTO
5. 写真あり・未出品 → LIST
6. 出品直後 → WAIT
7. 反応確認時刻到来 → CHECK
8. 反応なし → IMPROVE
9. 販売完了 → NEXT_ITEM

DAY7分類は、登録日から7日経過した時点でEventを集計する。

- LISTED: `FIRST_LISTING`またはLIST完了が1件以上
- PARTIAL: Action開始/完了があるがLISTEDではない
- NOT_STARTED: ユーザー実行Eventがない

## 7. DB差分候補

この節は候補であり、migrationは作成していない。

### 7.1 既存のまま使う

- `ProgramEnrollment.startsAt/endsAt/status`
- `ProgramMissionAssignment`
- `ProgramActionEvent`
- `ProgramProgressSnapshot`
- `ServiceMembershipEvent`
- `ServiceLineBroadcast` / `Recipient`
- `AiUsageEvent`

### 7.2 AI物販固有の最小model候補

`ResaleItem`相当をProgram共通Coreへ入れず、AI物販Capability配下へ置く。

候補field:

- id, workspaceId, groupId, programEnrollmentId, ownerUserId
- title/label（個人情報を含めない短い識別名）
- status: FOUND / PHOTOGRAPHED / LISTED / SOLD / SHIPPED / ARCHIVED
- listedAt, reactionState, reactionObservedAt
- lastImprovementType, lastImprovedAt
- soldAt, soldPriceYen, shippedAt
- createdAt, updatedAt

写真の保存が必要なら既存private storageの方式を再利用するが、V1の必須条件にしない。

### 7.3 決済model候補

実決済を導入する場合はProgram Enrollmentへ決済Provider固有IDを直書きせず、`ProgramPurchase`、`PaymentTransaction`、`PaymentWebhookEvent`相当を分離する。

- Offering/price reference snapshot
- buyer、seller、payment owner
- amount、currency、status
- provider、external checkout/payment/refund ID
- purchasedAt、refundedAt、cancelledAt
- idempotency key、raw payload hash、processedAt

### 7.4 既存JSON利用の限界

商品状態をすべて`ProgramActionEvent.metadata`へ入れるだけでも試作はできるが、現在商品を検索し、売上集計し、重複販売を防ぐ処理がJSON依存になる。90日運用と管理指標を考えると、商品current stateは構造化model、Eventは履歴という分離が妥当である。

## 8. API差分候補

実装候補であり、今回追加していない。

| API候補                                                 | 目的                              | 再利用するService                  |
| ------------------------------------------------------- | --------------------------------- | ---------------------------------- |
| `GET /api/services/{slug}/program-actions/today`        | 現在Action/WAITと表示snapshot取得 | Program Runtime + NBA orchestrator |
| `POST /api/services/{slug}/program-actions/{id}/start`  | START記録                         | ProgramRuntimeService              |
| `POST /api/services/{slug}/program-actions/{id}/result` | 完了/一部/未完了/助けが必要       | ProgramRuntimeService              |
| `POST /api/services/{slug}/resale-items`                | 対象商品作成                      | AI物販Capability                   |
| `PATCH /api/services/{slug}/resale-items/{id}`          | 出品・反応・改善・販売更新        | AI物販Capability + Event projector |
| `GET /api/services/{slug}/program-offer`                | DAY7状態別offer取得               | Classification + Offering          |
| `POST /api/services/{slug}/program-offer/decline`       | 非購入理由                        | Offer decision repository          |
| `POST /api/services/{slug}/checkout`                    | 一括決済開始                      | Payment port                       |
| `POST /api/payments/{provider}/webhook`                 | 購入/返金の冪等反映               | Payment adapter                    |
| `GET /api/services/{slug}/manage/program-funnel`        | 指標と個人timeline                | Event projector                    |

すべてでWorkspace、Group、Membership、Enrollmentを同時に照合し、same-origin、Zod validation、idempotency keyを必須にする。

## 9. UI差分候補

### 無料7日

- 登録完了後に「7日体験 1日目」を明示
- 今日のActionを1件だけ表示
- 完了、一部できた、できなかった、やり方が分からないを大きなボタンで入力
- 日付はMission完了数ではなく登録日で進む

### DAY7

- NOT_STARTED/PARTIAL/LISTEDごとに、7日間の事実と次の提案を表示
- 有料Programの期間、価格、提供内容をOffering snapshotから表示
- 購入しない理由を少数選択肢で記録
- 「価格が高い」を選んだ場合だけmonitor offeringを表示

### 有料90日

- 固定カレンダー一覧より「今日の1Action」を優先
- WAITは成功状態として表示し、完了ボタンを要求しない
- 販売/発送など重要Actionだけ確認入力を求める
- 現在商品と直近の結果を短く表示

### Action画面

- Action名、理由、3段階以内の手順、所要時間
- 対象商品
- 結果入力
- 助けが必要な場合の簡単な説明
- LINEから直接開ける

### 管理画面

- funnel集計
- 状態別人数
- 参加者timeline
- 失敗通知・決済・期限の要対応一覧
- CSV出力

## 10. LINE差分

### そのまま利用可能

- LINE userとの紐付け、友だち状態、通知同意
- Group/Service単位の専用ChannelとWebhook routing
- 共通LINEへのfallback方針
- 予約Job、lease、最大試行回数、error category
- 配信履歴、失敗者再送、quota、全体停止
- quiet hours、一時停止、Daily/weekday設定
- Service Broadcastの対象者snapshotと個別本文

### 不足

- Program Actionを通知resourceとして扱う型
- ACTION/WAIT/RECOVERY/EVENT template
- Program/Enrollment単位の通知topicとcooldown
- Program Actionを開く署名deep link
- Program Eventと通知結果の関連

最小案は、Service Broadcastの`automationKey`と個別`message`を使い、AI物販schedulerが対象者を1人ずつ固定する方法である。URLは本文に含められる。ただしProgram Actionとの参照と通知種別を集計したい場合、汎用Program Notification Deliveryへ拡張する方が長期的には安全である。

現行`LineMessageDelivery`は`dailyMissionId`が必須で、種別も`DAILY_MISSION`と`REMINDER`だけである。このtableへAI物販のActionを偽装して保存してはいけない。

## 11. Payment差分

90日一括商品は現状の機能だけでは実現できない。

存在するもの:

- `ProgramOffering.isFree`
- `ProgramOffering.priceReference`
- seller/priceOwner/paymentOwner等の責任主体
- Offering/Enrollmentの条件snapshot
- EnrollmentのstartsAt/endsAt/EXPIRED/CANCELLED
- サービス全体の`FREE / MANUAL_INVOICE / EXTERNAL_BILLING`

存在しないもの:

- Stripe SDK/Adapter
- Product/Price同期
- Checkout Session
- Payment/Refund transaction
- Webhook署名検証・冪等処理
- 購入とEnrollment付与のtransactional outbox相当
- 返金・キャンセルと権限停止
- 90日後の自動失効Job

V1の最速検証では、外部決済＋運営者の手動有料Enrollmentでも開始できる。ただし購入conversionの正確な計測と自動提供にはならない。本番で29,800円/9,800円を販売するならPaymentはDとして実装対象になる。

Entitlementは次のように表現できる。

- FREE: 無料OfferingのACTIVE Enrollment
- PAID_STANDARD: standard有料OfferingのACTIVE Enrollment
- PAID_MONITOR: monitor有料OfferingのACTIVE Enrollment
- EXPIRED: Enrollment.EXPIRED
- CANCELLED: Enrollment.CANCELLED

ただし「支払済み」の証拠はEnrollmentではなくPurchase/Payment側に保持する。

## 12. AI差分

既存AI基盤から再利用できるもの:

- DB管理されたProvider/Model/API key
- Provider接続確認と停止
- OpenAI runtime resolver
- Adapterによるstructured response
- Prompt version
- input/output token、推定原価、latency、成否
- Job retryと固定文fallbackを組み合わせる設計
- Bunshin/Service/Program goalを組み立てるContext取得

AI物販V1ではAIへAction選択を任せない。Rule Engineの出力を入力とし、許された意味を変えずに初心者向け文章へ変換するだけにする。

```text
rule output
  actionKey / reasonCode / item facts / allowed claims
      ↓
AI message renderer
      ↓ validation
title / reason / steps / encouragement
      ↓ failure
versioned fixed fallback copy
```

現行Promptは各`openai-*.ts`に定数として置かれており、Program/Action単位の設定基盤はない。V1ではAI物販rendererを独立Adapterにし、Program固有Promptを共通AI Serviceへ埋め込まない。完全な管理画面化は不要だが、Prompt key/version/tone/output schema/prohibited expressionsの境界は設ける。

## 13. Risks

### 技術的リスク

- Program Runtimeを接続せず旧90日固定関数を拡張すると、開始日と進捗の正本が二重になる
- Event metadataだけで商品を管理するとqueryと整合性保証が弱い
- 日次Jobとユーザー操作が同時に次Actionを生成すると重複提示が起きる。Enrollment sequenceとidempotencyを必ず利用する
- Runtime migrationはRLSを有効化している。実行DB roleとpolicy/bypassの運用を接続前に確認する

### 既存機能との競合

- `DailyMission`の1日1件制約はProgram Actionの正本に適さない
- `GroupMembership.lastUsedAt`はサービス閲覧で更新されるため、Action停止判定の唯一の根拠にできない
- SOCIAL向けActivity Continuity Ruleを全Program共通のPAUSED ruleとして使うと意味が変わる

### データ整合性

- Purchase、Enrollment、Action assignmentの境界を明確にする
- 商品更新とFIRST_* Event発火を同一transactionまたはoutboxで保証する
- Eventは追記型、Snapshotは再計算可能なcacheとして維持する
- 時刻は保存時UTC、Program day判定はProgram/Service timezoneを固定する

### LINE

- 専用LINE未設定、友だち未追加、通知同意なし、quota超過を別の状態として扱う
- WAIT通知まで毎日送ると離脱を招くため、Program別頻度とquiet hoursを適用する
- DailyMission専用deep linkを流用するとFKと認可が不自然になる

### 決済

- Webhook再送、順序逆転、二重購入、返金後アクセス、期限境界
- 価格をUI定数にせずOffering/Price snapshotから表示する
- OEM販売主体をV1で同時に解決しようとすると過剰設計になる

### 運用

- 「売れた」の自己申告精度と返金/キャンセル後の扱いを定義する必要がある
- 発送・個人情報・プラットフォーム規約に関する案内範囲を明確にする
- AI文面生成が失敗してもAction自体を失わせない

## 14. 推奨V1実装範囲

最低限の仮説検証に必要な範囲は次のとおり。

1. AI物販Service、7日/90日Program Definition、free/standard/monitor Offering
2. 公開登録完了から無料Enrollmentを冪等作成
3. Registration dateでDAY1〜DAY7を進める日次orchestrator
4. Program RuntimeのAction取得・結果入力APIとスマホ画面
5. 7日rule、DAY7分類、90日Next Best Action rule
6. 最小`ResaleItem`と出品・反応・改善・販売入力
7. FIRST_ACTION、FIRST_LISTING、FIRST_REACTION、FIRST_IMPROVEMENT、FIRST_SALE、PAUSED、RECOVERED、SECOND_SALE Event
8. ACTION/WAIT/RECOVERY/EVENTのLINE通知
9. DAY7 offer、非購入理由、標準/monitor購入導線
10. Program購入・Webhook・90日失効、または最初のpilotのみ明示した手動決済運用
11. 運営者のfunnelと個人timeline
12. AIは文面rendererのみ。固定文fallback必須

V1の仮説が「次Actionを決める仕組みへ支払うか」であるため、画像生成、動画生成、SNS自動投稿、note生成、Market Data取得は入れない。

## 15. 推奨実装順

1. **仕様固定**: AI物販Action/Event/State catalog、DAY7分類、timezone、販売・発送の状態遷移
2. **Program接続**: free Enrollment自動作成、Program day、Runtime API、旧進捗との二重正本防止
3. **AI物販Result**: ResaleItemとEvent projector
4. **Rule Engine**: 7日rule、90日NBA、WAIT、PAUSED/RECOVERY
5. **Member UI**: 今日のAction、結果入力、商品状態
6. **LINE**: scheduler、template、Program deep link、retry/monitoring
7. **DAY7 offer**: classification、非購入理由、standard/monitor offering
8. **Payment**: 一括checkout、Webhook、Entitlement、期限、返金
9. **Admin**: funnel、timeline、CSV、要対応一覧
10. **AI copy**: rule決定後の文章変換、versioning、usage、fallback
11. **pilot hardening**: race/idempotency/timezone/notification/paymentの既存テスト追加と実環境smoke

決済を手動でpilotする場合は8を一時的に運用手順へ置換できる。ただしPaid状態は運営者操作と監査記録で明示する。

## 16. V1で触らない方がよい既存機能

- SOCIAL `DailyMission`のschemaと1日1件制約
- Bunshin Memoryを商品台帳として使うこと
- 既存SNS90日レポートの開始日をAI物販の仮ルールに流用すること
- Fortune固有model/Prompt/Entitlement
- 画像・動画生成、CapCut連携、自動SNS投稿
- point/badgeの複雑な新rule
- Product PackをProgram購入権に転用すること
- 高度な紹介報酬
- note生成・投稿
- 高度BI、Market API、自由判断AI
- Stripe Connect、ノーコードProgram Builder、汎用rule DSL
- Platform共通ブランドを全面的にOEM化する改修

## 17. 不明点・確認事項

コードだけでは確定できない事業判断は次のとおり。

1. 登録日の定義はService Membershipの`REGISTRATION_COMPLETED.occurredAt`でよいか。LINE友だち追加時刻ではない前提を推奨する
2. DAY7判定は7日目の開始時、終了時、登録時刻から168時間後のどれか。暦日の終了時を推奨する
3. 出品の証拠は自己申告だけか、URL/スクリーンショットを任意取得するか
4. 反応状態の語彙と確認間隔
5. 販売取消・返品時にFIRST_SALEを取り消すか。Eventは取り消さず訂正Eventを推奨する
6. 発送Actionで住所等の個人情報を保存するか。保存しないことを推奨する
7. PAUSEDの日数、RECOVERY通知cooldown、通知上限
8. 29,800円と9,800円の税込/税別、返金規約、販売主体
9. monitor offerの表示条件と回数制限
10. pilot段階で決済を自動化するか、外部決済＋手動付与にするか
11. AI物販専用LINEを使うか、ワタシワークス公式LINEを使うか
12. AI物販利用者にBunshin作成を必須にするか。Program自体はMembership/Enrollment主体で動かせる

## 18. Horizontal Expansion Readiness

### 再利用できる部分

- Program Template/Version/Offering/Enrollment
- Assignment/Event/Snapshot
- Workspace/Group/Serviceの所有境界
- LINE接続・Job・Broadcast
- AI Provider/usage
- legal consent、public registration
- Action結果の共通語彙
- Program goal/support mode

### 現在SNS集客へ密結合している部分

- 現行90日Programの4 PhaseとAction catalog
- `businessGrowthActionForMission`の曜日判定
- `DailyMission`、LINE Mission summary/deep link
- Business Outcomeが`PostRecord.manualMetrics`内にあること
- 90日Reportの開始日が`ServiceMemberBusinessProfile.createdAt`であること
- AI Prompt本文がSNS Provider fileにあること

### 横展開時の方針

Program共通Coreは期間・提示・Event・進捗だけを扱う。AI物販、SNS集客、デジタル商品はProgram PolicyとCapability固有resourceを持つ。共通EngineはPolicyを選択して呼ぶだけにし、ITEM_FIND等を共通enumへ入れない。

## 19. OEM Readiness

既存階層は実質的に次の形を持つ。

```text
Workspace（運営団体/Tenant候補）
  └─ Group（サービス/Brand候補）
       ├─ ServiceConfiguration / Brand / Legal / Domain
       ├─ Program
       ├─ GroupMembership
       └─ Group LINE Channel
```

OEM基盤としての適合度は高い。Organization Entitlementには`oemEnabled`、`customDomainEnabled`、`dedicatedLineEnabled`もある。Platform ProgramとGroup private Programを分けられ、Offeringは販売・価格・決済・原価・支援・コンテンツ・キャラクターの責任主体を持つ。

不足は、Tenant別決済先、Program別Prompt/通知template、LP variation、Program Action engine registryである。V1ではWorkspace/Group/Service境界を使い、AI物販固有値をGroup設定またはProgram Definitionへ閉じ込めれば、将来OEMを妨げない。

## 20. Hard-coded Dependencies

| 固定依存                     | 現在位置                                                                    | 影響                         | V1方針                                                    |
| ---------------------------- | --------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------- |
| ワタシワークス名称・共通ロゴ | `app/ui/brand-mark.tsx`, shell/public page                                  | Platform shellのOEM表示      | Service画面では既存Brandを使う。Platform全面OEM化はしない |
| SNS90日Phase/Action          | `business-growth-program.ts`, `business-growth-actions.ts`                  | 新Programへ再利用不可        | AI物販Policyを別moduleに置く                              |
| SIDE_HUSTLE preset           | `program-definition-presets.ts`, admin editor                               | Program選択肢がコード依存    | AI物販preset追加は許容。汎用builderは作らない             |
| Prompt本文/Prompt version    | `apps/web/src/providers/openai-*.ts`                                        | Program別変更がコードdeploy  | AI物販rendererを独立しkey/version境界を設ける             |
| LINE Mission resource        | `LineMessageDelivery.dailyMissionId`, `MissionDeepLinkState.dailyMissionId` | Program Actionを直接通知不可 | Program通知を別resourceとして扱う                         |
| LINE message kind            | `DAILY_MISSION`, `REMINDER`                                                 | ACTION/WAIT/EVENTを区別不可  | Program通知kind/templateを追加またはBroadcast metadata化  |
| APP_URL                      | secure config/rich menu/deep link                                           | 単一origin前提               | 既存Custom Domain resolverを通す                          |
| 月額料金                     | `ServiceCommercialSetting.monthlyPriceYen`                                  | 一括Program価格を表現不可    | Program Offering + Payment price snapshotを使う           |
| Price provider               | `ProgramOffering.priceReference`のみ                                        | Stripe口座/Priceの意味未定   | Payment Adapter内で解釈                                   |
| 90日開始日                   | Business profile `createdAt`                                                | Enrollment開始とずれる       | AI物販では必ずEnrollment.startsAt                         |
| 千ノ国固有slug/copy          | manual/help/migration                                                       | 他Serviceへの影響は限定      | AI物販へ流用しない                                        |
| 問い合わせ先・規約URL        | ServiceConfigurationで設定可能                                              | 固定依存ではない             | そのまま利用                                              |
| ロゴ・色・独自domain         | ServiceBrand/CustomDomain                                                   | 設定済み境界                 | そのまま利用                                              |

## 21. Recommended Boundary Design

### Core

- Program Template/Version/Offering/Enrollment
- Assignment/Event/Snapshot
- Action orchestrator interface
- Notification request interface
- Payment/AI Provider port
- tenant/authorization/idempotency

### Program-specific

- AI_RESALE_V1 action/state/event catalog
- 7日/DAY7/90日rule
- ResaleItemと入力validation
- Action別result metadata schema
- Program固有fallback copy

### Tenant-specific

- Service名、ロゴ、色、規約、support、domain
- LINE Channelと通知文tone
- Program採用、Offering、価格参照
- Prompt selection/tone/prohibited expressions

### External Integration

- LINE Messaging/Login adapter
- OpenAI adapter
- Stripe等Payment adapter
- 将来のMarketplace/Market Data adapter

最小interface例:

```ts
interface NextActionPolicy {
  evaluate(input: ProgramDecisionContext): NextActionDecision;
}

type NextActionDecision = {
  actionKey: string;
  mode: 'WORK' | 'WAIT';
  reasonCode: string;
  target?: { resourceType: string; resourceId: string };
  ruleVersion: string;
  reevaluateAt?: Date;
};
```

共通Coreは`actionKey`の意味を解釈せず、Program固有Policyが所有する。AIはこのdecisionを変更できない。

## 22. Future OEM Roadmap

### Phase 2: 横展開可能なProgram運用

- Program Action orchestratorとPolicy registry
- Program別通知templateとPrompt key/version
- AI物販以外の2つ目のProgramで境界を検証
- Program別Offering/Price設定
- Tenant/Service別運用レポート
- Custom DomainでのAction deep link
- 単一販売主体でのPayment adapter

### Phase 3: OEM販売

- Tenant onboardingとBrand package
- Tenant別LINE接続wizardとtemplate管理
- Tenant別LP/Program公開設定
- 複数販売主体とStripe Connect等の評価
- Tenant別請求、手数料、精算、税務上の責任表示
- Prompt/Program versionの配布・fork・更新方針
- OEM support/SLA/監査/export

Phase 2/3でもノーコードProgram Builderを先に作らない。AI物販と次の1 Programから共通点が実証された段階で設定化する。

---

## 調査根拠の主要ファイル

- `docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`
- `docs/ARCHITECTURE_PRINCIPLES.md`
- `docs/program-module-current-state-analysis.md`
- `docs/PROGRAM_DEFINITION_V1_REPORT.md`
- `docs/PROGRAM_RUNTIME_V1_REPORT.md`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260917150000_add_program_runtime_tracking/migration.sql`
- `packages/application/src/program-core.ts`
- `packages/application/src/program-definition.ts`
- `packages/application/src/program-definition-presets.ts`
- `packages/application/src/program-runtime.ts`
- `packages/application/src/business-growth-program.ts`
- `packages/application/src/business-growth-actions.ts`
- `packages/application/src/activity-continuity-rules.ts`
- `packages/application/src/line-messaging-core.ts`
- `apps/web/src/http/programs.ts`
- `apps/web/src/http/service-participation.ts`
- `apps/web/src/http/service-daily-missions.ts`
- `apps/web/src/http/service-line-broadcasts.ts`
- `apps/web/src/jobs/daily-mission-job-handler.ts`
- `apps/web/src/services/service-generation-knowledge.ts`
- `apps/web/src/services/business-program-report-data.ts`
- `apps/web/src/ai/runtime-provider-configuration.ts`
- `apps/web/src/observability/ai-usage.ts`

## 調査時点で発見した既存課題

修正は行っていない。

1. Program Runtimeは保存・tenant境界テストまで実装済みだが、本番Web/API/Jobへ未接続
2. 現行SNS90日表示はProgram EnrollmentではなくBusiness Profile作成日を開始日に使用
3. Program管理APIはfree Offering、invitation-only、manual enrollmentに限定
4. Program Definition V1のscheduleは曜日指定だけで、登録日からのDAY番号や状態triggerを表現できない
5. Payment実装は存在せず、既存テストもProgram foundationへcheckout/paymentを導入していないことを確認している
6. DailyMission LINE deliveryはDailyMission FK必須で、Program Action通知へ直接再利用できない
7. PromptはversionedだがProgram/Tenant設定ではなくProvider sourceへ固定されている
