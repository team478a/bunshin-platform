# Learning First V2 / User-Created Outcome: Current Gap

## 基準・判定

2026-10-06。基準main `8c88daab44d350c164c7f269ee527bc119a929a7`（#1157 merge）。branch `docs/learning-first-v2-gap-analysis`。調査・設計文書のみ。コード、schema、migration、設定、本番操作、実Provider呼出しなし。

基準mainの[CI](https://github.com/team478a/bunshin-platform/actions/runs/37447130684)は成功。これは本番反映・実認証・教育効果・実原価の証明ではない。本番SHA/DB/設定を今回再確認していないため、本番状態はUNKNOWN。過去Runbookの監査表より現在コードを優先し、#1157の実行境界を反映して評価する。

**思想は部分一致、User-Created Outcomeの実証は不足。** 現Scopeには既に「AIを使って自分で作る」Suggestionがあり、Goalも「自分で指示を作成・出力確認できる」という能力表現。本人確認、Goal/Plan版、Assignment/Assessment、決定的Router、Privacyを再利用できる。全面再実装は不要。ただし現Pilotは3DefinitionのPrompt入力評価であり、外部AIを本人が操作して完成・再現・応用した証拠を取るLoopではない。割合による一致度は算出しない。

新目的は「AIを使って、自分にできることを増やす」。禁止するのは**Platformによる代行制作**であり、本人による成果物制作ではない。CONSULTING、顧客本番自動化代行、無確認Goal化の禁止は維持する。

## 調査根拠

パスはRepository root基準。E番号は以下の実ファイル・関数・model・testを指す。検索だけで機能の存在を断定せず、主要処理を読んで比較した。

| ID  | 根拠                                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01 | `packages/application/src/learning-scope.ts` の `defineLearningScopeResult`、`packages/capability-training/src/learning-scope.ts` の `classifyAiTrainingLearningScope` / `learningSuggestion`、同package `test/learning-scope.test.ts`                                                                                                                      |
| E02 | `packages/capability-training/src/learning-consultation.ts` の `consultAiTrainingLearning` / `conversionRequest` / `topicFor`、`packages/application/src/learning-consultation.ts`、`test/learning-consultation.test.ts`                                                                                                                                    |
| E03 | `packages/application/src/learning-profile-goal.ts`、`packages/capability-training/src/learning-profile-goal.ts` の `projectAiTrainingLearnerProfiles`、同package `test/learning-profile-goal.test.ts`                                                                                                                                                      |
| E04 | `packages/application/src/personal-learning-plan.ts` / `personal-learning-persistence.ts`、`packages/database/src/personal-learning-persistence.ts`、Prisma `ProgramMemberGoal` / `PersonalLearningGoalConfirmation` / `PersonalLearningPlanRevision`、`packages/database/test/personal-learning-persistence.integration-cases.ts`                          |
| E05 | `packages/capability-training/src/learning-definition-fixtures.ts` の `AI_TRAINING_LEARNING_DEFINITION_FIXTURES`、`mission-quality.ts` の `getAiTrainingMissionQuality`、`test/learning-definition-fixtures.test.ts`                                                                                                                                        |
| E06 | `packages/capability-training/src/skill-evaluation.ts` の `finalizeTrainingSkillEvaluation` / `mergeTrainingSkillScores`、`apps/web/src/jobs/training-answer-evaluation-job-handler.ts`、`apps/web/test/ai-training-skill-evaluation-boundary.test.ts`、Prisma `TrainingMissionAnswer`                                                                      |
| E07 | `packages/capability-training/src/learning-router.ts` の `routeAiTrainingLearning`、`packages/database/src/personal-learning-router.ts` の `PrismaPersonalLearningRouterBridge`、`test/learning-router.test.ts`、E04統合ケース                                                                                                                              |
| E08 | `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-pilot-card.tsx` の `PersonalLearningPilotCard`、同directory `ai-training-mission-card.tsx` / `ai-training-evaluation-card.tsx`、`apps/web/src/http/personal-learning-pilot.ts`、`apps/web/test/personal-learning-pilot-ui.test.tsx` / `personal-learning-pilot-http.test.ts` |
| E09 | `packages/database/src/personal-learning-pilot.ts` の `consult` / `feedback` / `currentAssignment`、`packages/database/src/personal-learning-router.ts` のBridge/Plan完了Event、Prisma `ProgramActionEvent`                                                                                                                                                 |
| E10 | `packages/database/src/training-work-result.ts` の `PrismaTrainingWorkResultRepository.record`、`training-toolkit.ts` の `PrismaTrainingToolkitRepository.save`、`apps/web/src/http/ai-training-participant.ts` の `recordAiTrainingWorkResultResponse`、`packages/database/test/ai-training-toolkit-boundary.test.ts`                                      |
| E11 | `packages/capability-training/src/personalization.ts`、`apps/web/src/services/ai-training-pilot-analytics.ts` の `buildAiTrainingPilotAnalytics`、`apps/web/test/ai-training-pilot-analytics.test.ts`                                                                                                                                                       |
| E12 | `apps/web/src/observability/personal-learning-ai-call.ts`、`packages/database/src/personal-learning-ai-call.ts`、`docs/ai-training/P1G_AI_COST_ANALYSIS.sql`、`apps/web/test/personal-learning-ai-call-observability.test.ts` / `personal-learning-ai-call-worker.test.ts`                                                                                  |
| E13 | `apps/web/src/services/personal-learning-pilot-access.ts`、`packages/capability-training/src/personal-learning-pilot.ts`、`packages/database/src/personal-learning-assessment-gate.ts`、旧Runtime `training-runtime-{candidate,state,decision}-repository.ts`、Web `personal-learning-pilot-access.test.ts` / `personal-learning-line-isolation.test.ts`    |
| E14 | `docs/ai-training/PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT_RUNBOOK.md`、`PERSONAL_LEARNING_EXECUTION_GATES_IMPLEMENTATION.md`、`PERSONAL_LEARNING_DEFINITION_APPROVAL_IMPLEMENTATION.md`、`PERSONAL_LEARNING_PILOT_PROFILE_IMPLEMENTATION.md`、P1-C-S Release Runbook、P1-G報告                                                                            |

Architecture Principles、Spec、Roadmap、Decision Log、README、既存Personal Learning Target/Planも参照。PlatformのOutcome FirstとAI研修のOutcomeは矛盾しないが、研修では本人の能力獲得を中心にし、売上・集客保証へ置換しない。

## Gap表

A=現行利用可能、B=小規模拡張、C=中規模拡張、D=新規機能、E=今回不要。新機能の承認ではない。時期はV2観点の推奨であり、Release安全Gateを延期する根拠にしない。

| 項目                          | 新しい目標状態                     | 現行実装                                           | Gap                                                               | A/B/C/D/E | 再利用可能機能                                | 必要変更                                     | Architecture Scope                           | 優先度 | Pilot前必須か    | リスク                                   | 根拠ファイル / model / function / test         |
| ----------------------------- | ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- | --------- | --------------------------------------------- | -------------------------------------------- | -------------------------------------------- | ------ | ---------------- | ---------------------------------------- | ---------------------------------------------- |
| Learning First / 3者          | Coach、Tool、本人Creatorを区別     | 本人学習・代行禁止                                 | 「成果物を作らない」の主体が曖昧                                  | B         | Scope/安全境界/既存UI文言                     | 主体・完成責任の明確化、境界例を新版で試験   | AI Training Package / Pilot / Service        | P0     | WAVE_0_REQUIRED  | 文言変更で代行が許可されたと誤認         | E01/E05/E08                                    |
| Learning Scope                | 能力獲得希望を安全に受理           | 6分類、曖昧確認、混合/bypass拒否                   | 「できるようになりたい」等は保守的確認へ戻る                      | B         | 6分類/確認/version                            | 明示能力希望の限定表現と否定ケース           | AI Training Package                          | P1     | WAVE_1_REQUIRED  | キーワードだけでCONSULTING通過           | E01/E02                                        |
| CONTENT_REQUEST               | 本人同意後、実践学習へ             | 自分で作るSuggestion、conversion確認               | メール等は汎用PROMPTへ変換、元用途の構造化候補なし                | B         | Suggestion≠Goal、bounded replay               | 対応可否と用途候補を明示、未対応はGap        | AI Training Package                          | P1     | WAVE_1_REQUIRED  | 完成品提示/無確認Goal、用途すり替え      | E01 learningSuggestion / E02 conversionRequest |
| CONSULTING / Automation       | AI学習のみ、本番接続代行なし       | CONSULTING対象外、自動化は同意後Gap                | V2 Discoveryが戦略相談へ逸脱する恐れ                              | A         | 現境界/bypass test                            | 拡張PR時の回帰・対象/対象外対例を追加        | AI Training Package                          | P0     | WAVE_0_REQUIRED  | 個社コンサル・本番権限取得               | E01/E02                                        |
| Learner Profile               | 必要最小、UNKNOWN保持              | 共通dailyMinutes/Goal参照、AI projection分離       | aiExperienceは既存保存から推測せずUNKNOWN、職種は相談projection外 | B         | TrainingParticipantProfile/2projection        | 職種や固定用途の最小投影を検討、全文保存なし | Personal Learning Core / AI Training Package | P1     | AFTER_PILOT      | 巨大Profile/業務秘密/未回答=初心者       | E03 / Prisma TrainingParticipantProfile        |
| Goal                          | AIで自分でできる到達状態           | 4種の能力objective、USE_AI_IN_DAILY_WORK参照       | 完成/再現の到達条件が未定義                                       | B         | ProgramMemberGoal/確認receipt                 | objectiveと成功条件のPackage mapping         | AI Training Package                          | P1     | WAVE_1_REQUIRED  | 業務KPIをGoal化、タイトル依存mapping破損 | E02 objectives / E04 / E08 PREPARE_PLAN        |
| Goal/Plan Persistence         | 正本・本人確認・版維持             | Goal正本、Plan revision/CAS/idempotency            | V2 Evidence追加時の所有/参照を要設計                              | A         | E04全体                                       | 既存正本維持、必要なら別Evidence契約のみ     | Personal Learning Core                       | P0     | WAVE_0_REQUIRED  | 二重Goal/Plan、旧版自動書換              | E04                                            |
| Definition                    | 固定骨格と本人実践設計             | Objective/Practice/Rubric/Safety/版参照            | 本人完成・再現・転移条件がない                                    | B         | 3Definition / Mission Quality successCriteria | 既存属性再利用、必要な条件のみ新版提案       | AI Training Package                          | P1     | WAVE_1_REQUIRED  | 同version意味変更、fixture自動承認       | E05                                            |
| Mission / Learn by Doing      | 本人が操作→確認→修正→完成          | 既存Prompt作成課題、固定hint/help                  | Prompt提出で止まり、外部操作/結果確認の段階なし                   | C         | Assignment/Answer/既存Mission UI              | Guided Practice最小段階とsafe exercise       | AI Training Package / Pilot / Service        | P1     | WAVE_1_REQUIRED  | 既存Mission差替え、機密入力、代行生成    | E05 PROMPT_BASIC / E08                         |
| First Success                 | 早期の役立つ本人完成を確認         | Mission PASS/完了Event                             | PASSは本人完成の証明ではない                                      | D         | scoped Event/Assignment/Goal/時刻             | 自己申告と検証の別Evidence、最初の1件を定義  | AI Training Package / Analytics              | P1     | WAVE_1_REQUIRED  | 虚偽達成、自動PASS、課題完了の誤用       | E06/E09                                        |
| Assessment / Capability Level | 支援込み/自力/判断/修正/応用を評価 | 6Skillの0〜100、PASS/REVIEW、60閾値                | 支援量・再現・転移Evidenceなし                                    | C         | versioned評価/Answer/Audit                    | 小さなRubric検証、ordinal levelを別投影      | AI Training Package                          | P1     | BEFORE_100_USERS | scoreを5段階へ機械変換、LLM過大評価      | E06                                            |
| Router                        | Evidenceで次を選ぶ                 | NEXT/REVIEW/RETRY/BLOCKED/UNKNOWN/完了             | 支援量調整や実践Evidenceを入力に持たない                          | A         | 決定的選定・3版・前提・Goal/期間Gate          | まず維持、将来必要なPractice完了条件だけ検討 | Personal Learning Core / AI Training Package | P0     | WAVE_0_REQUIRED  | UNKNOWNをPASS、完了=Goal達成/契約終了    | E07                                            |
| Teaching Personalization      | Skillに応じ支援を減らす            | 定型hint、旧V1用途例、Pilot supportSkill=null      | 段階的scaffoldと支援使用Evidence不足                              | C         | hint/help Event、固定Presentation             | 決定的支援段階、任意増援、撤回可能           | AI Training Package / Pilot / Service        | P2     | AFTER_PILOT      | 初心者支援不足、理解不足で自動減量       | E08/E11                                        |
| Consultation / Discovery      | 職種・作業から学習用途を発見       | テーマ/経験/Goal確認の最大3問                      | 作業→AI用途のbounded mappingなし                                  | D         | 既存Profile/相談Scope/承認Definition lookup   | 固定職種/作業候補、学習目的を本人選択        | AI Training Package / Pilot / Service        | P2     | AFTER_PILOT      | 営業戦略を提案、長期chat/個社分析        | E02/E03                                        |
| Pilot UI                      | 成功・再現まで分かる               | 相談→Goal→Plan→既存Mission→評価→次                 | 実践・完成・再現表示なし                                          | B         | mobile UI/理由code/API/Auth                   | Guided Practiceの最小UI、完了の意味明示      | Pilot / Service                              | P1     | WAVE_1_REQUIRED  | 「3課題完了=習得」の誤表示               | E08                                            |
| Feedback                      | Fit/理解/継続意向を区別            | FIT/NEUTRAL/NOT_FITの1Assignment1Event             | 満足度/継続意向/推奨意向とは別                                    | B         | FEEDBACK/PILOT_FIT                            | 最小任意選択を必要時だけ、未回答保持         | Pilot / Service / Analytics                  | P2     | OPTIONAL         | Fitを満足度や効果に代用                  | E09 feedback                                   |
| Real Use Evidence             | 使用/役立つ/自力/再現/転移         | V1固定Work Result、Pilot非表示                     | USED_WITH_EDITS等は能力確認でない                                 | B         | TRAINING_WORK_RESULT_RECORDEDの構造化保存案   | V2の限定Evidenceとserver gate/版を別設計     | AI Training Package / Analytics              | P1     | BEFORE_100_USERS | UIだけ復活、旧API認可をPilotへ流用       | E10/E08                                        |
| Toolkit / 成果物保存          | 成果物と習得Evidenceを分離         | 明示Toolkit保存はanswer全文をコピー                | 教材Promptと完成成果物を同一視し得る                              | E         | 既存V1を維持                                  | Pilotへ自動保存/Memory同期を追加しない       | Pilot / Service                              | P0     | WAVE_0_REQUIRED  | 本文のAnalytics転用、秘密の二重保存      | E10 / Prisma TrainingToolkitItem               |
| KPI / Telemetry               | 成功/能力/実用性を版付きで測る     | 相談status/count、Bridge/完了/Fit/AI Call          | First Success/再現/session/離脱の直接Eventなし                    | B         | ProgramActionEvent/P1G SQL/usageKey           | 小さなEvidence Event/集計仕様、Dashboard不要 | Analytics                                    | P1     | BEFORE_100_USERS | retryとcall混同、分母欠損を0扱い         | E09/E11/E12                                    |
| Privacy / V1分離              | 相談/業務/成果物本文を横断しない   | scoped正本/本文をTelemetryへ入れない/旧Runtime除外 | 新Evidenceの保持・削除・公開用途は未決                            | A         | tenant/Export/削除/実行gate                   | 新契約も同境界、本文なし、削除inventory      | Personal Learning Core / Pilot / Service     | P0     | WAVE_0_REQUIRED  | 管理者に相談開示、他User/Package暗黙共有 | E04/E10/E12/E13                                |
| Production Safety             | Closed Pilot安全Gateを維持         | dual flag/fresh gate/LINE拒否/max5/原価計測        | 累計100cap・費用admission・本番準備/実証不足                      | C         | #1157/既存Runbook/Telemetry                   | V2と別PR・別運用承認、未知をPASSにしない     | Pilot / Service                              | P0     | WAVE_0_REQUIRED  | V2を理由に既存NO-GO解除                  | E13/E14                                        |
| CORE1〜4 / Extensions         | 学習領域を整理、必要時だけ拡張     | Skill体系と3Definition                             | 領域分類は商品情報、実装共通Coreではない                          | E         | Package Skill/Definition参照                  | 設計taxonomyのみ、未対応はGap                | AI Training Package                          | P3     | OPTIONAL         | sales/image等を提供済み表示              | E05/E06                                        |

## KPIの取得可能性と限界

すべて同Workspace/Service/Enrollment/Goal/Plan revision/Definition versionの観測窓を固定。参加資格者と開始者の分母を混ぜない。欠損・未回答・未観測はUNKNOWNとして件数を併記する。P1-G原価と同じ呼出しを二重加算しない。

| KPI候補                                               | 現在取得できるもの                          | 追加が必要なもの / 誤用防止                                                      | 推奨時期         |
| ----------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- | ---------------- |
| First Success Rate / achieved                         | Assignment完了/PASS日時                     | 本人完成の定義、自己申告/検証区別、対象開始者分母                                | WAVE_1_REQUIRED  |
| Time to First Success                                 | Enrollment/Goal/Event日時                   | 起点を初回Practice開始等に固定、初成功Event。既存PASSまでの時間を代用しない      | WAVE_1_REQUIRED  |
| Sessions to First Success                             | 相談questionCount                           | session正本なし。question/API call数はsessionではない。まず手動評価              | AFTER_PILOT      |
| First Success Definition / Goal / 本人評価 / 実務利用 | Plan/Assignment版・Goal参照、Fit            | 成功Evidenceとの紐付け、役立つ/実務利用の別選択                                  | WAVE_1_REQUIRED  |
| Goal達成率                                            | Goal状態、Plan完了                          | 学習Goalの検証された達成条件。Plan完了≠Goal達成                                  | BEFORE_100_USERS |
| Guided Practice完了数                                 | 完了Assignment                              | 新Practiceの完了条件・版・重複排除、独立正本の必要性レビュー                     | WAVE_1_REQUIRED  |
| Real Use率                                            | V1 Work Result（USED_AS_IS等）              | Pilot入口/認可/版付きEvidence、未使用/対象外/未回答を分離                        | BEFORE_100_USERS |
| Self Reproduction率                                   | 直接証拠なし                                | 時間をあけた再現課題、支援量・観測者・方法の記録                                 | BEFORE_100_USERS |
| Capability Gain                                       | 既存skillImprovementPercent/0〜100変化      | 同Skill/Rule/条件の比較、level評価Rubric。ordinal +2は記述値で等間隔尺度ではない | BEFORE_100_USERS |
| Transfer / 応用率                                     | 直接証拠なし                                | 類似別用途の独立試験、対象者/期間・自己申告と確認を分離                          | AFTER_PILOT      |
| 継続率                                                | Event日時/回答/活動                         | cohort/週・再訪定義、Eligibility、削除/終了の扱い                                | BEFORE_100_USERS |
| Fit                                                   | PERSONAL_LEARNING_PILOT_FIT                 | 回答者率/未回答と共に集計。能力向上の証明ではない                                | WAVE_0_REQUIRED  |
| 満足度 / 推奨意向                                     | 直接証拠なし                                | 任意固定回答または限定ヒアリング、Fitとは別                                      | OPTIONAL         |
| Definition別離脱率                                    | 最終Bridge/Answer/評価までの参照            | 明示離脱Eventなし。観測窓内未完了proxyと本当の離脱を区別                         | BEFORE_100_USERS |
| RETRY率                                               | PERSONAL_LEARNING_ASSIGNMENT_BRIDGED.result | Router RETRY/REVIEWは取得可能、Job retry/API再送を分子にしない                   | WAVE_0_REQUIRED  |
| AI原価 / 品質                                         | PERSONAL_LEARNING_AI_CALL + AiUsageEvent    | 本番単価/usage欠損/保存障害の確認、Alert/Hard Stopは別                           | WAVE_0_REQUIRED  |

旧 `buildAiTrainingPilotAnalytics` は参加者ごとの最初/最後のscoreを比較し、REVIEW後の回答数からretryを推定する。V2の版固定・支援条件・Definition単位比較や能力5段階の測定器としてそのまま利用しない。P1-Gの版付き関連を優先する。

## 最大Gap 5件・開始判断

### 旧Work Result / Toolkit APIの追加監査事項

E08のPilot UIはWork Result/Toolkitを非表示にするが、E10の`recordAiTrainingWorkResultResponse`、`saveAiTrainingToolkitItemResponse`、`listAiTrainingToolkitResponse`は専用Pilot gateを呼ばず既存本人Service/Enrollment認可へ進む。読んだRepositoryもmodule/本人/期間/Assignment/PASS等を検査するが、Pilot flag/allowlist/markerの専用拒否はない。**非表示だけでPilotから旧APIを利用不能とは証明できない**。本人の完了済みPlan Assignment/Answerでの直接HTTP到達は今回未実行でUNKNOWNだが、コード上の不足はWave 0前に否定試験と最小保護の候補として別レビューする。これを新Evidenceの保存先として無条件に流用しない。他Userへアクセスできるという主張ではない。

| 項目                        | 新しい目標状態                             | 現行実装                | Gap                                | A/B/C/D/E | 再利用可能機能                            | 必要変更                                   | Architecture Scope | 優先度 | Pilot前必須か   | リスク                                         | 根拠ファイル / model / function / test |
| --------------------------- | ------------------------------------------ | ----------------------- | ---------------------------------- | --------- | ----------------------------------------- | ------------------------------------------ | ------------------ | ------ | --------------- | ---------------------------------------------- | -------------------------------------- |
| 旧Evidence/Toolkit HTTP境界 | Pilotの未許可保存/本文複製をserverでも防ぐ | UI非表示、旧API本人認可 | 専用Pilot gateなし、直接到達未検証 | B         | E13 gate/marker/Plan参照判定、E10本人認可 | 直接HTTP否定試験、必要な最小拒否、旧V1維持 | Pilot / Service    | P0     | WAVE_0_REQUIRED | 停止中Pilotから旧経路書込/意図しない本文コピー | E08/E10/E13                            |

1. Guided Practiceの外部AI操作→本人判断→修正→完成までの段階と証跡がない。
2. First Successは未定義。Prompt PASSを本人の実用的成功と誤認できる。
3. AssessmentはPromptの0〜100評価で、自力再現/応用/支援条件を測らない。
4. 支援量の適応がない。次Definition選定と教え方の個別化は別。
5. PilotのReal Use/能力変化Evidenceがない。旧Work Result/Toolkitを再表示するだけでは不足。

**Wave 0前のV2最小条件**: 3者/代行禁止の文言・境界を人間レビューし、3Definitionで何を測れて何を測れないかを明示する。安全な合成題材での本人実践を人間が観察する手順・同意・最小Evidence記録を用意する。First Successは人間観察の暫定指標とし、未実装を自動計測済みと表示しない。製品がV2完結済みとは宣伝しない。これらは最小文書/必要な文言PRと運用準備でよく、Level EngineやFactoryは不要。

**別途絶対必要なProduction Gate**: 累計100 cap/authority、費用admission、trusted本番Definition承認/本人Profile準備、Migration/backup/RLS/実Auth/共有資源と停止drainの証拠。#1157でflag/fresh gate/LINE境界のコード不足は補完されたが、実環境PASSではない。100capを「100人になる直前」へ延期して既存Gate Eを弱めない。現在はNO-GO。

Wave 0内部の人間観察で実践仮説を試すことと、100人へV2体験を製品提供することを区別する。Wave 1以降のV2実装・運用条件は[実装計画](AI_TRAINING_LEARNING_FIRST_V2_IMPLEMENTATION_PLAN.md)を参照。支援量LLM生成、広範Discovery、転移評価、session新基盤はPilot後でよい。

## 検証・未確認

基準mainで既存Scope/Consultation/Definition/Profile/Router/Pilot policyの6ファイル168テスト、ApplicationのScope/Profile/Plan/Persistenceの4ファイル102テストを再実行し、計270件すべて成功。文書PR CIの最終結果はPR本文に記録する。本調査の追加テスト/コード変更はない。旧Evidence/ToolkitへのPilot直接HTTP、実認証E2E、本人実践、教育効果、実Provider、実請求、本番Migrationは未確認。対象構造以外の全Repositoryを監査済みとはしない。

調査はここで停止。実装・本番操作・100人募集は別指示と人間承認を待つ。
