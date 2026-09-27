# ワタシワークス AI研修MVP 現状調査・差分分析

- 対象リポジトリ: `team478a/bunshin-platform`
- 調査基準: `main` commit `9753f0880cd81e06cdf764a9b9399e62292113b6`
- 調査日: 2026-09-28（Asia/Tokyo）
- 調査範囲: コード、Prisma schema、Repository、API、ユーザー画面、管理画面、LINE、AI評価、Job、認可、テスト
- 本書の性質: 実装前の読み取り調査。DB変更、Migration、API/UI変更、本番操作は行っていない。

## 1. Executive Summary

現行bunshinには、AI研修MVPの土台だけでなく、主要な利用フローの多くがすでに実装されている。

- `ProgramTemplate` / `ProgramTemplateVersion` / `ServiceProgram` / `ProgramOffering` / `ProgramEnrollment` によるPackage提供
- AI研修専用の `AiTrainingV1Policy` と25個のMission Definition
- 初期診断、Goal設定、今日の課題、回答、AI評価、復習、難易度変更、WAIT、RECOVERY
- `ProgramMissionAssignment`、`ProgramActionEvent`、`ProgramProgressSnapshot` による履歴と状態管理
- LINE通知、WebへのDeep Link、管理者Dashboard、Pilot Analytics
- My AI Toolkit、成長表示、Workspace / Service / Enrollment / User境界の検証

したがって、AI研修を別システムとして新規構築する必要はない。推奨は **B: 一部共通化済みのProgram Runtimeを正本にし、AI研修固有のPolicy・Catalog・評価・画面をPackageとして維持する** 方式である。

一方、依頼の中核である「100人いれば100通り」は現時点で **一部可能** である。次Missionの選択は職種、AIレベル、Goal、完了履歴、成功・失敗、Skill、休眠状態によって変わる。しかし、Mission本文は固定された実務Scenarioが中心で、詳細な仕事内容、時間がかかる仕事、端末、本人の実務結果を用いた日々の内容生成までは接続されていない。Bunshin、Memory、Group KnowledgeもAI研修の選定・評価には現在使われていない。

MVPの主要10条件に対する現状は次のとおり。

| 成功条件               | 判定     | 根拠・不足                                                                                   |
| ---------------------- | -------- | -------------------------------------------------------------------------------------------- |
| Packageへ参加          | 可能     | ServiceProgram、Offering、Enrollmentを利用                                                   |
| 初期情報登録           | 一部可能 | 職種、AIレベル、用途、課題、テーマ、時間、Goalは保存。仕事内容、時間がかかる仕事、端末は不足 |
| 個人ごとの今日のAI仕事 | 一部可能 | Stateに応じてMission keyは変化。具体的Scenarioの個人化は限定的                               |
| Web上で実践            | 可能     | スマートフォン向け課題・回答画面あり                                                         |
| AIフィードバック       | 可能     | 構造化Skill評価、PASS/REVIEW、強み・弱みを保存                                               |
| 実践結果保存           | 一部可能 | 回答・評価は保存。実際の仕事で使用した結果は未保存                                           |
| 前回結果を次回へ反映   | 可能     | 完了、失敗、Skill、Review、BottleneckをPolicyが参照                                          |
| 未実施検知             | 一部可能 | 休眠日数からRECOVERY。理由別Barrierは未実装                                                  |
| LINEから誘導           | 可能     | Mission通知とDeep Linkあり。実運用確認は本調査対象外                                         |
| 管理者集約表示         | 一部可能 | 参加・継続・進捗・弱点等あり。実務利用指標は不足                                             |

本格実装前に優先すべき差分は、(1) 初期診断の仕事Context補完、(2) 実務利用結果と未実施理由をEventとして保存、(3) それらを既存Policyへ接続、(4) 1分版と練習／実務モードをAssignmentのVariantとして表現、(5) 回答データの保持・削除・管理者閲覧方針の確定、である。

## 2. 現在のワタシワークス構造

### 2.1 全体構造

```text
Workspace
└─ Group / Service
   ├─ ServiceProgram
   │  └─ ProgramTemplateVersion (published definition)
   ├─ ProgramOffering
   ├─ GroupMembership
   ├─ ProgramEnrollment
   │  ├─ TrainingParticipantProfile
   │  ├─ ProgramMissionAssignment
   │  ├─ TrainingMissionAnswer
   │  ├─ ProgramActionEvent
   │  ├─ ProgramProgressSnapshot
   │  └─ TrainingToolkitItem
   ├─ LINE configuration / delivery / job
   └─ Admin dashboard / analytics
```

UserとBunshinは別Entityであり、`1 User : N Bunshin` の原則が維持されている。AI研修はEnrollment単位で動作し、Bunshinの存在を必須にしていない。この判断は、法人研修の受講者がSNS用Bunshinを持たない場合にも対応できるため妥当である。

### 2.2 Package / Program Runtime

`packages/application/src/program-definition.ts` の `ProgramDefinitionV1` は、期間、Route、Phase、Mission、通知、結果定義を表す。公開済みVersionは `ProgramTemplateVersion` として保持される。

AI研修は `ServiceProgram.settings.moduleKey === AI_TRAINING_V1` により有効化され、次の既存正本を利用している。

- `ProgramMissionAssignment`: 次に提示するMission
- `ProgramActionEvent`: 閲覧、回答、評価、操作等の履歴
- `ProgramProgressSnapshot`: 現在状態のProjection
- `ProgramMemberGoal`: 選択した学習Goal
- `TrainingParticipantProfile`: AI研修固有の初期状態とSkill

### 2.3 Daily Mission / Weekly Planとの関係

SNSの `DailyMission` と `WeeklyPlan` は、Bunshin、投稿戦略、SNS投稿生成向けのCapability固有モデルである。AI研修はこれを直接再利用せず、Program Runtimeの `ProgramMissionAssignment` を「今日のAI仕事」の正本としている。

この分離は適切である。名称が似ていても、SNS投稿案と研修課題では状態遷移、回答、評価、復習条件が異なる。共通化すべき範囲は、Assignment、Event、Progress、通知、監査、認可であり、SNSのDailyMissionテーブルへAI研修を押し込むべきではない。

### 2.4 AI研修Capability

`packages/capability-training/src/index.ts` に次が実装されている。

- `AI_TRAINING_V1_MODULE_KEY`
- `AI_TRAINING_V1_RULE_VERSION`
- `AiTrainingV1Policy`
- 25個のMission key
- 30日、PERSONALIZED Route、FOUNDATION / PRACTICE / APPLICATION PhaseのProgram Definition
- WAIT / RECOVERY

PolicyはAIへMission選択を丸投げせず、次の順に決定する。

1. Active WAIT
2. 休眠によるRECOVERY
3. Review / recent failure
4. 基礎Missionの前提条件
5. Learning Goal
6. Role別Mission sequence
7. 次回判定までのWAIT

この決定的な構造は、再現性、監査性、Provider障害耐性の面でMVPに適している。

## 3. AI研修に再利用できる既存機能

| 既存資産                                | 現在の利用                                  | 再利用判断                        |
| --------------------------------------- | ------------------------------------------- | --------------------------------- |
| ProgramTemplate / Version               | AI研修ProgramのVersion正本                  | そのまま利用                      |
| ServiceProgram                          | Group / ServiceへのPackage有効化            | そのまま利用                      |
| ProgramOffering / Enrollment            | 募集・参加・期間                            | そのまま利用                      |
| ProgramMissionAssignment                | 今日のAI仕事の正本                          | そのまま利用                      |
| ProgramActionEvent                      | 回答、評価、Hint、延期等                    | 小規模なevent type追加で利用      |
| ProgramProgressSnapshot                 | Phase、成功・失敗、Skill等の現在状態        | そのまま利用し、Projectionを拡張  |
| ProgramMemberGoal                       | 30日後のGoal                                | そのまま利用                      |
| TrainingParticipantProfile              | 職種、AI経験、課題、時間、Skill             | 小規模拡張                        |
| TrainingMissionAnswer                   | 自由記述回答と評価                          | そのまま利用。Privacy運用は要確定 |
| TrainingToolkitItem                     | 本人が選択した成果物                        | そのまま利用                      |
| AiUsageEvent                            | Provider、model、usage、cost、latency、成否 | そのまま利用                      |
| LINE Delivery / Jobs                    | 通知、再通知、Deep Link、冪等性             | そのまま利用しPolicy設定を補完    |
| Admin Dashboard                         | 受講状況、継続、弱点、最終活動              | 小規模拡張                        |
| Pilot Analytics                         | 診断、Goal、回答、PASS/REVIEW、再回答等     | 小規模拡張                        |
| Workspace / Group / Membership認可      | Tenant・Service・User境界                   | そのまま利用                      |
| Zod validation / same-origin protection | API入力と更新保護                           | そのまま利用                      |

## 4. 不足機能

### 4.1 個別化Context

現在の初期診断は次を持つ。

- role
- aiLevel
- aiUseCases
- workChallenges
- preferredTopics
- dailyMinutes（5 / 10 / 15）
- learningGoalKey

不足しているのは、詳細な仕事内容、時間がかかる具体業務、利用端末、本人が今日扱いたい仕事、過去の実務利用結果である。選択肢中心の診断は導入負荷を下げるが、実務Scenarioを本人向けに変える情報量としては不足する。

### 4.2 100人100通りのMission内容

Mission選択は個別化されているが、`mission-quality.ts` のScenario、task、constraints、criteriaは固定定義である。同じRole、Goal、Stateの受講者には同じMissionと同じScenarioが出る可能性がある。

これは誤りではない。必要が同じ人へ同じ学習目標を出すことは許容される。ただし「実際の仕事の中でAIを使えるようになる」という商品価値には、固定学習目標を維持したまま、本人の仕事ContextからScenario、例、Hintを安全に個別化する層が必要である。

### 4.3 未実施理由とBarrier Adjustment

7日間の未活動からRECOVERYを選択できる。`HINT_VIEWED`、`HELP_REQUESTED`、`TRAINING_POSTPONED` も保存される。しかし、次の理由分類と分岐は未実装である。

- 忙しい
- 難しい
- 仕事に関係ない
- 操作が分からない
- 必要性を感じない
- その他

### 4.4 1分版

学習Missionとしての1分版は未実装である。WAITの所要時間1分は学習ではなく、RECOVERYも約3分である。単なる本文短縮ではなく、同じlearning objectiveから最小の実践を切り出すVariantが必要である。

### 4.5 練習モード / 実務モード

FOUNDATION / PRACTICE / APPLICATION Phaseはあるが、「架空課題」と「本人の実際の仕事」を明示的に管理するmodeはない。また、次の実務利用結果が保存されない。

- そのまま使った
- 修正して使った
- 使わなかった

### 4.6 対話型の再実践

現在は自由記述回答、AI評価、再回答の流れを実現できるが、継続する会話Sessionではない。MVPではChat基盤を新設せず、Attempt単位の回答と構造化Feedbackを維持する方が安全である。必要な不足は「次に何を直すか」を明確にして再回答へ戻すUXであり、自由会話履歴の大量保存ではない。

### 4.7 AI評価の非同期耐性

評価はHTTP request内で同期実行される。Provider障害は失敗として記録されるが、長時間処理、再試行、後続回復をJobで管理する構造はない。Pilot人数が少ない間は運用可能だが、法人展開前には評価JobとRetry方針を検討すべきである。

### 4.8 Privacy lifecycle

回答本文は `TrainingMissionAnswer.answer` に保存され、AI Providerへ送信される。UIには機密情報を入力しない注意があるが、次が未確定である。

- 保持期間
- 本人による削除・Export
- 企業管理者が閲覧可能な範囲
- Support時の閲覧権限と監査
- Providerへの送信内容と契約上の扱い
- 個人情報・企業秘密のMask / Redaction

## 5. 既存機能との差分

### A〜N評価

| 項目                                     | 判定     | 現在の根拠                                                              | 必要な差分                                                 |
| ---------------------------------------- | -------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| A. Daily Missionを「今日のAI仕事」に流用 | 可能     | ProgramMissionAssignmentと専用UIで実現済み                              | SNS DailyMissionではなくProgram Assignmentを正本として維持 |
| B. ユーザーごとに異なるMission           | 可能     | Role、Level、Goal、履歴、Skill、休眠からPolicyが選択                    | Mission内Scenarioの個人化を追加すると商品価値が上がる      |
| C. 昨日の結果を今日へ利用                | 可能     | answer evaluation、events、snapshot、needsReview、success/failureを参照 | 実務利用結果も追加                                         |
| D. 100人100通り                          | 一部可能 | State差によりMission選択が変わる                                        | 仕事内容と実務Contextに基づくScenario Variantが不足        |
| E. 未実施検知                            | 可能     | 最終活動とpauseAfterDaysからRECOVERY                                    | 3回連続等のPolicy設定を明確化                              |
| F. 未実施理由保存                        | 未実装   | Postpone/help eventはあるが理由taxonomyなし                             | ProgramActionEvent metadataへ理由を保存                    |
| G. 理由で次Mission変更                   | 未実装   | Barrier別Ruleなし                                                       | Policy入力へBarrier projectionを追加                       |
| H. 通常版／1分版                         | 未実装   | 5/10/15分のみ                                                           | Assignment VariantとしてSHORTを追加                        |
| I. 練習／実務モード                      | 一部可能 | Phaseは存在                                                             | explicit modeと実務入力の安全なFlowを追加                  |
| J. 実務利用結果保存                      | 未実装   | Answer / evaluationのみ                                                 | WORK_RESULT_RECORDED eventを追加                           |
| K. LINEから直接遷移                      | 可能     | 専用通知、Deep Link、current assignment照合                             | 運用設定と実Production E2E確認                             |
| L. 管理者の集約利用状況                  | 一部可能 | Dashboard / Pilot Analyticsあり                                         | Barrierと実務利用集計を追加                                |
| M. Packageとして追加                     | 可能     | capability-trainingとServiceProgramが存在                               | Tenant別Catalog設定は将来差分                              |
| N. SNS等へ再利用                         | 一部可能 | Program Runtime、Event、LINE、AI usageは共通                            | Training固有Skill/Answerを無理に共通化しない               |

## 6. AI研修専用にすべき機能

次はAI研修固有のCapability内に残す。

- Learning CatalogとGoal候補
- AI活用Skill rubric
- 研修Missionのlearning objective、scenario、task、criteria
- `AiTrainingV1Policy`
- TrainingParticipantProfileの意味とvalidation
- TrainingMissionAnswerと構造化AI評価
- Review、Promotion、difficultyの研修Rule
- My AI Toolkit
- 受講者向け研修画面、成長表示
- 研修管理Dashboardの指標定義
- AI TrainerとしてのPrompt

SNS、占い、副業へ同じSkill、回答形式、画面、Promptを持ち込まない。

## 7. 共通エンジン化すべき機能

既に共通化されているものは作り直さない。

- Program version / publication
- Offering / Enrollment
- Assignment
- Action Event
- Progress Snapshot
- Goal / Preference
- Idempotency
- LINE Delivery / Deep Link / retry
- AI usage audit
- Workspace / Service / Membership / Enrollment isolation
- Admin向け集約Queryの共通Scope

新たに共通候補とするのは、最低限のBarrier loopである。

```text
Action assigned
→ Result or Non-completion event
→ Barrier reason event
→ Package-specific projection
→ Package-specific policy adjustment
→ Next assignment
```

共通CoreはEvent envelope、scope、idempotency、timestamp、actorだけを扱う。Barrierの意味と次ActionはPackage Policyが扱う。これによりAI研修の「忙しい→SHORT」とSNS支援の「素材不足→素材準備Action」を同じRuleへ無理に統合せずに済む。

## 8. DB変更候補

### 8.1 MVPで新規テーブルを作らず表現できる差分

| 要件              | 既存保存先                               | 提案                                                       |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------- |
| 未実施理由        | ProgramActionEvent                       | event type + versioned metadata                            |
| 実務利用結果      | ProgramActionEvent                       | `TRAINING_WORK_RESULT_RECORDED` 等を追加                   |
| 1分版             | ProgramMissionAssignment.displaySnapshot | `variant: SHORT` と所要時間、課題snapshot                  |
| 練習／実務mode    | Assignment snapshot / Event metadata     | `mode: PRACTICE \| WORK`                                   |
| 選定根拠          | Assignment reasonCode / displaySnapshot  | 利用したState categoryを追加し、本文や秘密情報は複製しない |
| Barrierの現在状態 | ProgramProgressSnapshot                  | EventからProjectionする                                    |

### 8.2 Schema変更を検討する候補

1. `TrainingParticipantProfile` のassessment拡張  
   `workContext`、`deviceCapabilities` 等をversioned JSONで保持する案。自由記述を無制限に増やさず、Purposeを限定する。
2. `TrainingMissionAnswer` のPrivacy lifecycle  
   `redactedAt`、`retentionExpiresAt` 等が運用要件で必要なら追加する。
3. Toolkit metadata  
   将来、Templateの用途、入力変数、Versionを持たせる場合のみ拡張する。

新しい汎用Activity table、Skill専用巨大テーブル、別Assignmentテーブルは不要である。

## 9. API変更候補

既存APIを維持し、次を小さく追加する。

1. 初期診断Profileのversioned項目追加
2. `POST .../actions` でBarrier reasonをvalidation付きで保存
3. 実務利用結果を保存するAction endpoint
4. SHORT variantを要求するAction、またはProfileの当日time budget更新
5. Mission取得responseへ `mode`、`variant`、個別化理由のユーザー向け説明を追加
6. AI評価が非同期化される場合のみ、evaluation status取得と安全なretry endpoint

全更新でWorkspace、Group、Membership、Enrollment、Moduleの照合とsame-origin保護を維持する。

## 10. UI変更候補

### 10.1 初期設定

- 現行4 stepを維持
- 仕事内容と時間がかかる仕事を、選択肢＋短い任意入力で取得
- 利用端末を選択式で取得
- AIおすすめGoalを理由付きで提示し、本人が変更可能な現在の方針を維持
- 機密情報を入力しない案内を入力欄の直前にも表示

### 10.2 今日のAI仕事

- 「通常5分」「今日は1分」を明確に選択可能にする
- 練習か実務かを表示
- Goal、今日身につけること、なぜこの課題かを上部に置く
- AIが完成回答を先に出さず、本人の回答→Feedback→再回答の順を維持

### 10.3 実務利用結果

- そのまま使った
- 修正して使った
- 使わなかった
- 使わなかった理由

回答本文の再入力を求めず、最小の状態だけを保存する。

### 10.4 学習履歴・Toolkit

既存Growth / Toolkitを利用する。点数より「できるようになったこと」と実務で再利用できる成果物を優先表示する。

## 11. LINE連携変更候補

現行実装には次がある。

- 今日の研修Mission通知
- Missionのtheme / reason / minutes
- WebへのDeep Link
- 対象Enrollmentとcurrent assignmentの照合
- 同一通知の冪等性
- Postpone後のReminder
- shared / dedicated LINE routing、consent、following確認

不足・確認事項は次である。

- Tenantごとの配信時刻、曜日、頻度、停止Policy
- Barrier reasonをLINEで簡単に回答するか、Webだけにするか
- 1分版をLINE上で選択した場合の安全なWeb遷移
- 本番での送信、リンク、Assignment一致のE2E確認
- 退会、Enrollment終了、Program停止時の配信停止運用

LINE本文へ長い教材、回答、詳細評価、機密情報を含めない現行方針は維持する。

## 12. 管理画面変更候補

現行Dashboardは、参加者、active、継続率、support必要数、完了Mission、Role、AI level、topic、弱点、最終活動を表示できる。Pilot Analyticsは診断、Goal、開始、回答、PASS/REVIEW、再回答、Skill改善、Toolkit保存を集計する。

追加候補は次である。

- 今週利用人数
- 実務利用人数と利用率
- Barrier理由別人数
- SHORT選択率
- PRACTICE→WORK移行率
- 評価Provider失敗・再試行件数

管理者一覧Queryは回答本文を取得しない現行設計を維持する。個別回答の閲覧が必要なSupport機能を将来追加する場合は、目的、Role、本人通知、監査、保持期間を先に決める。

## 13. Privacy / Security上の注意

### 現在確認できた防御

- Workspace / Group / Membership / Enrollment / User / ModuleのRepository検証
- 別Enrollment、別User、別Serviceへのアクセス防止テスト
- AI研修はBunshinを必須にせず、他Bunshin Memoryを暗黙参照しない
- Toolkitは本人が明示保存したPASS済み成果物だけを対象
- 管理Dashboardは回答全文を一覧取得しない
- API入力validationとsame-origin保護
- AI usage監査にprovider、model、promptVersion、usage、latency、cost、成否を記録

### 実装前に決める事項

- 研修回答と実務Contextの保持期間
- 削除、退会、企業契約終了時の処理
- 管理者・Support担当者の閲覧範囲
- Providerへ送るデータの最小化と契約条件
- ログへ回答本文や個人情報を残さないRule
- 実務入力の機密情報Mask / 注意 / 送信前確認
- 集計結果の少人数表示による個人推定防止

## 14. 技術的リスク

| リスク                                      | 影響                      | 対応                                                                |
| ------------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| 固定Scenario中心で個別化価値が弱い          | 商品価値の誤認            | 学習目標を固定し、Scenarioだけを仕事Contextから安全に個別化         |
| Profileへ自由記述を増やしすぎる             | PrivacyとPrompt injection | 選択肢中心、短いPurpose限定入力、Provider送信前整形                 |
| Event metadataの無秩序化                    | 集計不能                  | schemaVersionとZod schemaをevent typeごとに定義                     |
| Snapshotを直接更新し続ける                  | Eventとの不整合           | Event→Projectionの一方向を維持                                      |
| 同期AI評価                                  | timeout、二重送信         | idempotencyを維持し、規模拡大時にJob化                              |
| AI評価だけで進級                            | 誤判定                    | Domain thresholdとMission prerequisiteを最終判定に使う              |
| Training機能の過度な共通化                  | SNS/占いとの密結合        | Program Runtimeだけ共通、PolicyとmeaningはCapability内              |
| Program definitionとcode catalogのVersion差 | 再現性低下                | assignmentにcatalog/rule versionを記録し、公開Versionとの対応を固定 |
| LINE通知とcurrent missionのずれ             | 誤課題へ誘導              | pre-send eligibilityとAssignment ID照合のE2E test                   |
| 回答本文の長期保存                          | 情報漏洩                  | retention、redaction、アクセス監査を実装前に決定                    |

## 15. MVP実装案

### 推奨構造

```text
共通Program Runtime
├─ Enrollment / Assignment / Event / Snapshot
├─ Goal / Preference
├─ Job / LINE / Deep Link
├─ AI Usage / Audit
└─ Scope / Idempotency
          ↓
AI Training Package
├─ Assessment / Learning Catalog
├─ Training State Projection
├─ AiTrainingV1Policy
├─ Mission Quality Definition
├─ Answer / Evaluation / Review
├─ Barrier Adjustment / Short Variant
├─ Practice / Work Result
└─ Training UI / Admin Metrics
```

### 最小差分

1. Profileに仕事Contextと端末情報を追加
2. Barrier reasonとWork resultをProgramActionEventで保存
3. Snapshot projectionへBarrier、実務利用、当日time budgetを反映
4. `AiTrainingV1Policy` に理由別分岐を追加
5. Mission AssignmentへSHORT / PRACTICE / WORK variantを保存
6. 固定Mission objectiveとcriteriaを変えず、Scenario / hintだけを個人化
7. 管理画面へBarrierと実務利用の集計を追加
8. Privacy lifecycleと評価失敗時の運用を確定

AIによる初期提案はGoal候補の順位付けに限定し、本人が確認・変更できるようにする。Mission key、学習目的、評価基準、進級条件をAIが自由生成しない。

## 16. 実装優先順位

| 優先度   | 内容                            | 理由                           |
| -------- | ------------------------------- | ------------------------------ |
| Critical | Privacy・保持・管理者閲覧方針   | 実務情報を入力する前提条件     |
| High     | 初期診断の仕事Context拡張       | 個別化の入力が不足             |
| High     | Work result保存と次回Policy反映 | 「仕事で使える」を測る中核Loop |
| High     | Barrier reasonとAdjustment      | 離脱改善の中核Loop             |
| High     | 1分版Variant                    | 「忙しい」への実用的な対応     |
| Medium   | Practice / Work mode            | 実務移行を明確化               |
| Medium   | Scenario / Hintの安全な個人化   | 100人100通りの体感を高める     |
| Medium   | LINE設定とE2E確認               | 継続運用に必要                 |
| Medium   | Adminの実務利用・Barrier集計    | 法人価値の可視化               |
| Low      | Template pattern detection      | Pilotデータを見てからRule化    |

## 17. 影響範囲

### 主な既存ファイル

- `packages/application/src/program-definition.ts`
- `packages/capability-training/src/index.ts`
- `packages/capability-training/src/runtime.ts`
- `packages/capability-training/src/learning-catalog.ts`
- `packages/capability-training/src/mission-quality.ts`
- `packages/capability-training/src/skill-evaluation.ts`
- `packages/capability-training/src/growth.ts`
- `packages/capability-training/src/line-action.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/src/training-runtime.ts`
- `packages/database/src/training-runtime-candidate-repository.ts`
- `packages/database/src/training-runtime-decision-repository.ts`
- `packages/database/src/training-profile.ts`
- `packages/database/src/training-answer.ts`
- `packages/database/src/training-interaction.ts`
- `packages/database/src/training-toolkit.ts`
- `apps/web/src/http/ai-training-participant.ts`
- `apps/web/src/http/ai-training-evaluation.ts`
- `apps/web/src/providers/openai-training-answer-evaluator.ts`
- `apps/web/src/services/ai-training-action-line-scheduler.ts`
- `apps/web/src/services/ai-training-admin-dashboard.ts`
- `apps/web/src/services/ai-training-pilot-analytics.ts`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-setup-card.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-mission-card.tsx`
- `apps/web/app/s/[serviceSlug]/manage/training/page.tsx`

### 影響を避ける領域

- SNS `DailyMission` / `WeeklyPlan` の生成経路
- Fortune Capability
- Bunshin / Memoryの既存分離
- AI物販Policy
- OEM決済
- 本番Program Versionの直接変更

## 18. テスト方針

### Domain / Policy

- 同じProgramでもRole、Goal、Skill、FailureによりMissionが変わる
- 同じStateなら決定的に同じMissionを選ぶ
- 前回失敗時はReview、成功時は次へ進む
- Barrier `BUSY` はSHORT、`TOO_DIFFICULT` はEASY / REVIEWを選ぶ
- `NOT_RELEVANT` はGoal再設定へ誘導する
- SHORTでもlearning objectiveを失わない
- WORK modeは前提条件を満たすまで選ばれない
- AI障害時もMission選択は継続する

### Data / Isolation

- User AからUser Bのprofile、answer、skill、toolkitを参照できない
- Enrollment AからBのEvent / Snapshotを参照しない
- Workspace / Service / Groupを越えない
- 他Bunshin Memoryを暗黙利用しない
- event idempotency keyの重複で二重計上しない
- published Program Versionを後から変更しない

### API / UI

- 初期診断のvalidationと変更
- AIおすすめGoalを本人が変更できる
- Mission表示→回答→評価→再回答→次Mission
- 「今日は1分」選択
- 未実施理由保存
- 実務利用結果保存
- 管理者画面に本文を出さず集計だけを表示
- スマートフォン幅で主要操作が上部に見える

### AI評価

- 正常な構造化response
- invalid JSON、timeout、429、5xx
- Provider失敗時に回答とAssignmentを破損しない
- retryで評価Eventを二重登録しない
- Promptへ別User / 別Service dataが混入しない
- usage、latency、promptVersionを記録する

### LINE / Job

- current assignmentとDeep Linkが一致
- 同一日・同一Assignmentを二重送信しない
- Enrollment終了、通知停止、follow解除時に送信しない
- POSTPONED reminderと通常通知を二重送信しない
- 別TenantのLINE Channelへ送らない

## 19. GAP表

| Requirement                    | Current                                          | Reusable                         | Gap                                   | Proposed Change                          | Priority |
| ------------------------------ | ------------------------------------------------ | -------------------------------- | ------------------------------------- | ---------------------------------------- | -------- |
| 個別Daily Mission              | State別にMission選択済み                         | Policy / Assignment / Snapshot   | Scenario個人化が限定的                | 仕事Contextを使う安全なVariant生成       | High     |
| Previous Result → Next Mission | success/failure/skills/reviewを参照              | Event / Snapshot / Policy        | 実務利用結果なし                      | Work result eventをPolicyへ接続          | High     |
| Barrier Detection              | dormancy、help、postponeあり                     | ProgramActionEvent               | 理由taxonomyと分岐なし                | Barrier event schema + projection + rule | High     |
| Short Mission                  | 5/10/15分、Recovery 3分                          | Assignment snapshot              | 学習用1分版なし                       | SHORT variant定義                        | High     |
| Practice/Work Mode             | Phaseと実務Scenarioあり                          | Program phase / Assignment       | 明示modeと利用結果なし                | PRACTICE/WORK variant + result event     | Medium   |
| LINE Notification              | 通知、Deep Link、冪等性あり                      | LINE job基盤                     | Tenant別Policyと本番E2E確認           | 設定・停止・リンク整合test               | Medium   |
| Admin Analytics                | 参加、継続、進捗、Skill等あり                    | Dashboard / Pilot Analytics      | 実務利用とBarrier集計なし             | aggregate query追加                      | Medium   |
| Initial Assessment             | role/level/use cases/challenges/topics/time/goal | TrainingParticipantProfile       | 仕事内容、時間業務、端末不足          | versioned work context追加               | High     |
| AI Feedback                    | 構造化Skill評価あり                              | Answer / evaluator / usage audit | 同期処理、回復運用                    | Pilot後にJob化を判断                     | Medium   |
| Toolkit                        | 明示保存・一覧あり                               | TrainingToolkitItem              | pattern検知なし                       | 最初は手動、Pilot後に簡易Rule            | Low      |
| Privacy                        | Scope検証、注意表示あり                          | Auth / repository isolation      | retention/delete/support policy未確定 | 運用方針と必要最小schema                 | Critical |

## 20. 実装フェーズ案

依頼書のPhase案は、現行実装ではPhase 1〜5と7〜8の多くがすでに存在する。そのため、重複実装を避けて次の順へ変更する。

### Phase 0: 現状調査・設計確定

- 本書のレビュー
- Privacy、実務入力、管理者閲覧のHuman Decision
- Event metadata schemaとRuleを確定

### Phase 1: 既存Packageの運用準備確認

- TenantへのServiceProgram / Offering / Enrollment設定手順
- published definitionとcatalog/rule versionの対応確認
- Pilot用Feature flag、LINE停止条件、運用Runbook

### Phase 2: 初期設定・個人学習Profile補完

- 仕事内容、時間がかかる仕事、端末
- Goal recommendationの説明
- 既存Profileの後方互換

### Phase 3: 今日のAI仕事の個人Context強化

- 固定learning objective / criteriaを維持
- 仕事ContextからScenario / example / hintのみ個人化
- Personalization根拠を安全にaudit

### Phase 4: 実践・AI Feedbackの堅牢化

- 再回答LoopのUX
- Provider失敗時のretryとstatus
- AI usage / prompt version監査

### Phase 5: Result保存・Next Mission

- WORK result event
- result projection
- Policy反映

### Phase 6: 未実施・Barrier・1分版

- 理由回答
- Barrier別Rule
- SHORT variant
- RECOVERYとの整合

### Phase 7: LINE通知の運用確定

- Tenant別配信Policy
- current Mission / Deep Link E2E
- 停止、延期、終了の動作

### Phase 8: 管理者Analytics

- 実務利用
- Barrier
- SHORT利用
- 個人回答を見せない集計

### Phase 9: 実務mode・Template提案

- PRACTICE→WORK移行
- My AI Toolkit再利用
- 同種業務の反復データを確認後、簡易RuleでTemplate提案

Phase 9の自動pattern検知はPilotデータなしで先行実装しない。

## 21. 最終判断

### A. 現行bunshinへの追加実装

**評価: 可能だが、すべてを既存共通層へ直接追加する方法は非推奨。**

Program Runtime、認可、LINE、AI usage、監査、管理画面基盤を再利用できる。ただし研修SkillやAnswer semanticsをApplication共通層へ広げると他Capabilityへ不要な依存が生まれる。

### B. 一部共通化＋AI研修Package

**評価: 推奨。**

現在の実装がすでにこの方向にある。Program Runtimeを正本とし、AI研修のProfile、Catalog、Policy、Mission quality、Answer、Evaluation、Toolkit、UIを `capability-training` と関連Adapterへ置く。Barrier eventのenvelopeなど、二つ以上のPackageで同じ責務が確認できた部分だけ共通Coreへ昇格する。

### C. 別モジュールとして分離

**評価: 別システムは非推奨。Capability境界としての分離は継続。**

完全な別システムにすると、Enrollment、Tenant分離、LINE、AI usage、認可、Audit、OEM設定が重複し、ユーザー体験と運用が分断される。一方、AI研修CapabilityとしてPackage境界を保つことは必要である。

### 結論

**Bを採用する。**

現行bunshinを使い、共通Program Runtimeは変更を最小化する。AI研修の中核差分はCapability内へ実装する。MVPで必要な共通追加は、既存 `ProgramActionEvent` と `ProgramProgressSnapshot` を使ったBarrier / Result loopに限定する。巨大なLearning / Adjustment Engineを先に新設しない。

## 22. Human Decisions Required

実装開始前に、次を事業・運用・法務と決める必要がある。

1. 回答本文と実務Contextの保持期間
2. 企業管理者が見られる情報の範囲
3. Support担当者が個別回答を閲覧する条件と監査
4. 実務modeで入力可能な情報と禁止情報
5. AI Providerへ送信するデータと契約条件
6. 「未実施」の判定日数とReminder頻度
7. Barrier理由ごとの正式な分岐
8. 1分版を本人選択にするか自動提案にするか
9. Practice→Work移行条件
10. Program終了時の回答・Toolkit・履歴の扱い
11. TenantごとにCatalog / Mission / Promptを変更できる範囲
12. Pilot成功指標の目標値

## 23. 調査根拠

主に次を、schemaだけでなく呼び出し経路とテストまで確認した。

- Program definitionとruntime
- AI Training Capability、Policy、Mission quality、Skill evaluation
- Prisma modelsとTraining repository群
- Participant / Evaluation API
- Participant setup / mission / evaluation / growth / toolkit UI
- LINE scheduler、eligibility、job連携
- Admin dashboard、Pilot Analytics
- AI provider adapter、AiUsageEvent
- Workspace / Service / Membership / Enrollment isolation tests

本調査では本番データ、実LINE送信、Provider実呼び出し、Production deploymentの動作確認は行っていない。コード上の実装存在とテスト存在を根拠としており、実運用での正常性は別の非本番Pilotと本番監視で確認する必要がある。
