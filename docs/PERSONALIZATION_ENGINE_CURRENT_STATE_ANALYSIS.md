# Personalization Engine 現状調査・差分設計

調査基準: `origin/main` の `4433b13c`（2026-09-20）。この文書は調査・設計のみであり、アプリケーションコード、Prisma schema、migrationは変更していない。

## 1. Executive Summary

ワタシワークスには個別最適化の素材が既に十分ある。SNSではBunshin、戦略、週次計画、投稿履歴、フィードバック、Memory、サービス固有Knowledgeを実際の生成経路へ渡している。AI物販では、Programの行動割当・イベント・進捗スナップショット・ルールベースのNext Actionが実装済みである。

不足しているのは、これらをSNS・副業・占い・将来の研修から共通の方法で取得し、状態を算出して候補から次の行動を選び、理由を監査できる**共通オーケストレーション層**である。新しい巨大なユーザー記憶やMission基盤は不要であり、既存のProgram Runtimeを核に、Context Builder、State Projection、Selectorを追加する方針を推奨する。

現時点でAI物販はこの方向を先行実装している。一方SNSは生成コンテキストが豊富でも「Program横断の次Mission選定」は未接続、占いは参加者・履歴・評価を安全に保存するが、過去ReadingやMemoryを次回AI入力には使っていない。よって、共通Engineを導入しても、既存のSNS DailyMissionや占い生成を置き換える必要はない。

## 2. Current Architecture

| 層                   | 現行の正本                                                                        | 役割                                                    |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Identity / isolation | `User`、`Workspace`、`GroupMembership`、`Bunshin`                                 | User、サービス、Bunshinのスコープを分離                 |
| SNS capability       | `packages/capability-social`、`apps/web/src/services/daily-mission-generation.ts` | 週次計画・日次Mission・投稿案・結果を扱う               |
| Program core         | `packages/application/src/program-core.ts`                                        | Template、Version、ServiceProgram、Offering、Enrollment |
| Program runtime      | `program-runtime.ts`、`program-next-action.ts`、`capability-resale`               | 行動の割当、イベント、進捗、ルールベース選定            |
| Memory               | `BunshinMemory`、`memory-selector.ts`                                             | Bunshin固有の記憶を関連度順に選択                       |
| Fortune              | `packages/capability-fortune`、`packages/database/src/fortune.ts`                 | Participant、Reading、Feedback、承認済みKnowledge       |
| AI / audit           | `AiUsageEvent`、`recordAiUsageSafely`、`GenerationContextSnapshot`                | Provider、モデル、Prompt、使用量、生成時文脈の追跡      |
| LINE                 | `GroupLineConnection`、`LineMessageDelivery`、deep link / webhook                 | 通知・入口。サービス本体とは分離                        |

## 3. Existing Assets

### 個別情報

| 情報                         | 正本 / 経路                                                            | AI生成への接続                               |
| ---------------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| 基本プロフィール・業種・目的 | `UserRegistrationProfile`、`ServiceOnboardingResponse`                 | SNSのサービス用Business Profileとして利用    |
| Bunshin目的・人格・顔/声方針 | `Bunshin`、`BunshinPersonality`、`BunshinPersonalityVersion`           | Daily Mission生成・品質確認へ接続            |
| Strategy / 投稿方針          | Strategy系モデル、`weekly-plan-generation.ts`                          | WeeklyPlan / DailyMission生成へ接続          |
| 作業可能時間・支援形式       | `ProgramMemberPreference.preferredSupportMode`、Program設定            | Programには保存済み。SNS生成への統合は限定的 |
| Goal                         | `ProgramMemberGoal`、`ProgramEnrollment.goalSnapshot`                  | Program内で保持。共通Contextへ未集約         |
| 過去行動・結果               | `MissionActivity`、`PostRecord`、`MissionFeedback`、ProgramActionEvent | SNS・Programごとに利用。横断Projectionなし   |
| Knowledge                    | `OwnerKnowledge` / `BunshinKnowledgeGrant`、`GroupKnowledgeChunk`      | SNS生成へスコープ付きで接続                  |

`User`と`Bunshin`は別エンティティであり、Memoryも`workspaceId + bunshinId`で分離される。この前提はPersonalization Engineでも維持する。

## 4. SNS Personalization Current State

`apps/web/src/services/daily-mission-generation.ts` は実運用の個別生成経路である。生成前に、対象Bunshin、SocialProfile、承認済みStrategy、WeeklyPlan、ContentPillar、最近のMissionのtopic/angle/format、キャンペーン、サービスBusiness Profile、付与済みKnowledge、GroupKnowledge、トレンド候補を取得する。`SelectBunshinMemories`で関連Memoryを最大5件・3,000文字まで選び、Mission Brief、本文生成、品質チェックへ渡す。

`DailyMission` はBunshin単位・日付単位で一意であり、`MissionActivity` は閲覧・開始・完了等をidempotency key付きで保存する。`PostRecord.manualMetrics`、`MissionFeedback`、投稿採否や不採用理由は保存され、Weekly Plan生成では直近Feedbackを集計している。

したがってSNSは「内容の個別化」はA（既存利用可能）。ただし、難易度、復習、停止復帰をProgram共通の状態として決めるSelectorは未実装でありB/Cである。

## 5. Program Module Current State

`ProgramTemplate` と `ProgramTemplateVersion.definition` はTemplateの版管理を持つ。`ProgramCoreService.createTemplateVersion` はpublish時に `parseProgramDefinition` を通し、公開版の定義を検証する。現行definition V1には、期間、route、phase、mission、notificationPolicy、resultDefinitionsがある。Published versionを直接編集する経路は持たず、Version追加が前提である。

`ProgramEnrollment` はサービス会員、Program、Offering、開始/終了日、Goal/Offering snapshotを固定する。`ProgramMissionAssignment` は選定済みのMission、route、phase、reasonCode、variant、WORK/WAIT、再評価時刻、表示用snapshot、ruleVersionを保存する。`ProgramActionEvent` はidempotency keyで二重計上を防ぎ、`ProgramProgressSnapshot` はroute/phase/state/bottleneck/完了数/次回評価時刻をProjectionとして保存する。

AI物販の `AiResaleV1Policy` はこの実装を使用する。商品状態、最終行動、待機期間、休眠を入力として、`ITEM_FIND`、`PHOTO`、`LIST`、`WAIT`、`CHECK`、`IMPROVE`、`SHIPPING`、`RECOVERY`を**ルールだけで**選ぶ。これは共通Engineの望ましい基準実装である。

制約は、現行 `ProgramDefinitionV1` が日/曜日に寄った固定Mission定義で、entryConditions、stateRules、bottleneckRules、difficulty、復習/進級ルールを構造化していない点である。

## 6. Fortune Personalization Current State

Fortuneは `FortuneParticipant`、`FortuneReading`、`FortuneFeedback` を `workspaceId + groupId + serviceSettingId + participantId + memberUserId` で隔離する。1参加者・1日1Readingであり、Reading削除後の同日再抽選も防止している。AI生成は承認済みカード解釈、当日のtheme/card/orientationを使い、`AiUsageEvent` にモデル、Prompt version、トークン、失敗を記録する。Feedbackは選択式で保存される。

ただし `OpenAiFortuneReadingGenerator` の入力は当日のカードと承認済み解釈であり、過去Reading、Feedback傾向、Bunshin Memory、個人Goalは入力していない。現状の個別化は「参加者ごとの履歴・結果の隔離」と「当日の抽選」であり、次回内容への学習は未実装である。占いの安全性上、Personalizationを導入しても過去評価でカード結果を恣意的に変えず、表現トーンと小さな行動提案の範囲に限定する必要がある。

## 7. Memory Current State

`packages/application/src/memory-selector.ts` の `SelectBunshinMemories` は、入力queryとの日本語正規化・token重なり、importance、confidence、更新日時でMemoryを選ぶ。最大10件、既定は5件/3,000文字で、repository取得後にも `workspaceId`、`bunshinId`、active、未削除を検査する。

MemoryはUser共通ではなくBunshin単位である。このためProgram / Fortuneで再利用するには、まず「どのBunshinの文脈として使うか」を明示する必要がある。Bunshinのない研修Enrollmentに無理にMemoryを作らず、初期段階ではMemory optionalのContextとして扱うことを推奨する。

## 8. Activity / Event Current State

| 種類                          | 正本                                        | 再利用性                   |
| ----------------------------- | ------------------------------------------- | -------------------------- |
| SNS Mission閲覧・開始・完了等 | `MissionActivity`                           | SNS内はA、Program横断へはB |
| 投稿完了・手入力指標          | `PostRecord` / `SocialInsightSnapshot`      | SNS成果判断にA             |
| 投稿Feedback                  | `MissionFeedback`                           | SNS改善にA                 |
| Program行動                   | `ProgramActionEvent`                        | 共通Programの基盤としてA   |
| Program現在状態               | `ProgramProgressSnapshot`                   | ProjectionとしてA          |
| 副業の成果                    | `ResaleItem` + ProgramActionEvent           | AI物販にA                  |
| 占い閲覧・評価                | `FortuneReading` / `FortuneFeedback`        | Fortune固有入力としてB     |
| LINE配信                      | `LineMessageDelivery`、attempt / connection | 通知履歴としてB            |

新しい万能Activityテーブルを作るべきではない。Program化された領域では `ProgramActionEvent` を共通の正本とし、既存SNS / Fortuneイベントはsource eventとして読取Adapterで正規化する。

## 9. Gap Analysis

| 機能                                    | 現状                          | 分類 | 必要な差分                                 |
| --------------------------------------- | ----------------------------- | ---- | ------------------------------------------ |
| User / Bunshin Context                  | モデル・取得経路がある        | B    | scope付きRead Modelへ集約                  |
| Memory選択                              | Bunshin単位で実装済み         | A    | Context Builderから任意利用                |
| Goal / Preference                       | Program内に保存済み           | B    | Enrollmentごとの標準DTO化                  |
| Recent Activity / Feedback              | 個別テーブルに存在            | B    | Capability Adapterで正規化                 |
| Program / Phase / progress              | Runtimeとsnapshotあり         | A    | Selector入力へ利用                         |
| Skill / understanding                   | 構造化状態なし                | C    | state projectionの任意attributesとして開始 |
| Bottleneck                              | snapshotにkeyあり、物販で使用 | B    | Program definitionの規則化                 |
| Mission候補取得                         | AI物販に存在、汎用化なし      | B    | definitionから候補を解決                   |
| Next Mission選択                        | AI物販Policyのみ              | B    | 共通Selector interface + Program固有Policy |
| AI ranking                              | なし                          | C    | 候補内順位付けのみ。fallback必須           |
| 選定理由 / rule version                 | Assignmentに保存済み          | A    | Context hash / candidate listを補強        |
| State snapshot                          | ProgramProgressSnapshotあり   | A    | 属性拡張前提で利用                         |
| Route / difficulty / review / promotion | route/phaseはある             | B/C  | definition V2とPolicyに追加                |

## 10. Proposed Architecture

```
Scoped inputs (User, Membership, Bunshin?, Enrollment)
  -> PersonalizationContextBuilder
  -> Capability Activity Adapters + ProgramProgressSnapshot
  -> Program-specific Policy (hard rules)
  -> CandidateMissionResolver
  -> optional AI Ranker (candidate IDs only)
  -> Domain validator
  -> ProgramMissionAssignment + ProgramActionEvent + ProgressSnapshot
  -> Capability renderer / LINE notification
```

Coreは候補の**選定**のみを担い、SNS投稿、占い本文、研修教材を直接生成しない。`NextActionPolicy<TContext>` を共通interfaceとして維持し、AI物販の `AiResaleV1Policy` を最初の実装とする。SNS、研修、占いはそれぞれProgram固有のPolicyを実装する。

AI RankerはHard Ruleと候補検証の後にだけ動作させる。出力は候補IDの順位と説明に限定し、存在しないMissionの生成、route/phase越境、スコープ外データ参照を禁止する。障害時は決定的なPolicy順位で確定する。

## 11. Data Model Proposal

最初に新規の巨大なプロフィール、Memory、Activityテーブルは不要である。以下を段階的に検討する。

1. **Program definition V2**: V1を残し、新Versionで `entryConditions`、`stateRules`、`bottleneckRules`、`candidateRules`、`difficultyRules`、`reviewRules` を追加する。V1は既存validatorのまま継続する。
2. **Projection attributes**: `ProgramProgressSnapshot` にJSONを無制限に足す前に、`stateAttributes`（schemaVersion付きJSON）または必要な少数の列を比較する。最初は物販のようにstateKey/bottleneckKey/完了数/lastActionを利用し、AI研修Pilotで必要になった属性だけ追加する。
3. **Selection audit**: `ProgramMissionAssignment.displaySnapshot` へ候補、確定理由、context/schema/rule/program version、AI rankingの有無をsnapshotする。変更できない選定履歴として使う。
4. **ProgramActionEvent**: `MISSION_VIEWED`、`MISSION_STARTED`、`MISSION_COMPLETED`、`MISSION_SKIPPED`、`ANSWER_SUBMITTED`、`ANSWER_EVALUATED`、`GOAL_UPDATED`、`RESULT_RECORDED`、`ROUTE_CHANGED`、`PHASE_CHANGED`を予約語として定義する。既存DailyMission Activityの複製ではなく、Program Assignmentに紐付く時だけ書く。

## 12. Next Mission Selection Flow

1. EnrollmentとServiceMembershipをスコープ付きで解決する。
2. Published ProgramTemplateVersionと既存ProgressSnapshotを取得する。
3. ProgramActionEvent、必要なCapabilityイベント、Goal、Preference、Bunshin Memory、サービスKnowledgeをContext DTOへ取り込む。
4. Hard Ruleで期限切れ、WAIT、必須復習、休眠RECOVERY、権限・利用期間を判定する。
5. Program固有Policyがdefinition内の候補Mission keyだけを返す。
6. AI rankingを有効にした場合だけ、候補間の順位付けを行う。
7. ValidatorがMission key、route、phase、capability、時間、scopeを検証する。
8. `ProgramMissionAssignment`、`ProgramActionEvent`、`ProgramProgressSnapshot`を同一transactionでidempotently更新する。
9. Capabilityが表示用コンテンツを作り、LINEはその導線を通知する。

## 13. Security / Isolation

Context Builderの入力キーは必ず `workspaceId`、`groupId`、`programEnrollmentId`、`groupMembershipId`、`actorUserId` とする。Bunshinを使う場合は `workspaceId + bunshinId + ownerUserId` を検証する。Memoryは同じBunshin、Knowledgeは同じService/Group、Feedbackは同じactor、Enrollmentは同じGroupMembershipに限定する。

Repositoryの検索でスコープを付けるだけでなく、取得後DTOにもscopeを保持し、Policyへ未加工のPrisma entityを渡さない。AI入力はContext Builderが許可した要約だけにする。ログ・選定監査には他ユーザーの本文、LINE ID、秘密情報を残さない。

## 14. Audit / Observability

現行の `ProgramMissionAssignment` はreasonCode/ruleVersion/displaySnapshotを、`ProgramActionEvent` はidempotency keyを、`AiUsageEvent` はprovider/model/promptVersion/usage/latencyを保持する。これを利用し、Selection Auditに次をsnapshotする。

- selected mission / route / phase / difficulty
- deterministic reason codes と rule version
- program template version、state revision、context schema version
- 候補key一覧と除外理由（要約）
- AIを使った場合のみ provider/model/promptVersion/順位

AI usageの原価・失敗記録は既存 `recordAiUsageSafely` を使い、新しいAI監査基盤は作らない。

## 15. Migration Impact

今回の調査ではmigrationなし。実装時の初期PRはdefinition schema（アプリケーションのvalidator）だけで開始できる。永続化が必要になった時に限り、ProgressSnapshot属性または選定audit snapshotを追加する。Published Versionのdefinitionは更新せず、新Versionを作成する。

## 16. API Impact

既存のSNS / Fortune APIは維持する。追加候補はサービス内部向けに限定する。

- Enrollmentごとの現在状態取得
- Assignmentの閲覧・開始・完了・skip
- Next Missionの再評価（運営者・job限定）
- Goal / Preference更新

APIは任意のmission keyを受け取って決定させず、サーバー側Selectorの結果だけを状態遷移対象にする。

## 17. UI Impact

利用者には多機能画面を見せず、「今やること」「理由」「所要時間」「後でよい場合はWAIT」を一画面で示す。研修Pilotでは、Goalと支援形式の最小入力、現在の課題、完了/困った/後で行うの3行動で十分である。運営者画面には個人のタイムライン、現在State、選定理由、再評価予約、手動介入履歴を追加する。

## 18. Test Plan

- 同一Programで異なるstateなら異なる候補が選ばれる。
- 同一stateならHard Ruleの結果は再現可能である。
- 存在しないMission Definition、異なるroute/phaseは確定できない。
- WAITにはreasonとreevaluateAtが必須である。
- 同一event idempotency keyは二重計上されない。
- 別ServiceのKnowledge、別User/BunshinのMemory/Feedback、別Enrollmentのsnapshotを取得できない。
- Published Versionのdefinitionを後から変更できない。
- AI ranker障害時に決定的fallbackでAssignmentを作れる。
- assignmentのsnapshotから選定理由・rule/program versionを追跡できる。

## 19. PR分割案

1. **Context contracts** — Context DTO、scope guard、SNS/Fortune/Program read adapter。DB変更なし。
2. **Program definition V2** — 新Version用validator、candidate/state/bottleneck規則。V1互換を維持。
3. **State projection** — ProgramActionEventからProgressSnapshotを更新する決定的Projection。
4. **Common selector** — Candidate resolver、Policy registry、domain validator、assignment audit snapshot。AIなし。
5. **AI ranker** — 候補内ranking、usage audit、fallback。feature flag付き。
6. **AI研修Pilot** — 1 ProgramだけでGoal/Preferenceと異なる課題を検証。
7. **SNS / Fortune adapter** — 既存生成経路へ段階的接続。既存DailyMission・Fortune本文を置換しない。

## 20. Risks

- Contextを広げすぎると個人情報・越境混入リスクが上がる。
- Program definitionを一度に汎用化しすぎると、現行物販の確実なルールが不透明になる。
- AI rankingの説明を事実のように扱うと監査性が下がる。
- DailyMissionとProgramActionEventを相互複製すると二重計上する。
- 占いに過去の反応を強く反映すると、安全・公平性・説明可能性を損なう。
- 長いContextはAIコストと応答時間を増やす。要約・上限・選択理由が必要である。

## 21. Human Decisions Required

1. 最初の共通PilotをAI研修にするか、既存AI物販を共通Engineへ寄せるか。
2. 研修で許容する個別化の範囲（難易度、順番、教材、評価）を決める。
3. どの状態を利用者に説明し、どの内部判定を非表示にするか。
4. AI rankingを有効にする条件、コスト上限、必ずfallbackする条件。
5. BunshinのないProgramでMemoryを任意にする方針。
6. Fortuneで個人履歴を使う範囲を、カード抽選ではなく文章トーン・行動提案へ限定するか。

## 結論

各ジャンルに別々の個別最適化基盤を増築する必要はない。既存Program Runtimeを共通の実行・監査基盤、既存Memory / Knowledge / Activityを入力資産、Capabilityを表示・生成担当として分離すればよい。最初はAI物販の決定的Policyを基準に、AI研修Pilotで共通Context / Selectorを検証し、SNSと占いは既存機能を維持したままAdapterとして段階接続することを推奨する。
