# ワタシワークス AI進化対応 Phase 1 現状監査

## 1. 基準・検証範囲

- 監査日: 2026-10-09。対象: `team478a/bunshin-platform` のみ。
- 基準main: `5b4957f1f2a983aa571ebd72d73ec4d67c3bbe84`（#1186）。branch: `codex/ai-evolution-phase1-audit`。
- `AGENTS.md`、`BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`、`ARCHITECTURE_PRINCIPLES.md`、`IMPLEMENTATION_ROADMAP.md`、`DECISION_LOG.md`、Codex/Personal Learning/OEMの既存報告書と実コードを照合した。
- 旧 `ai-sns-agent` / `InstagramOEM` は対象外。コード・schema・設定を変更せず、実Provider、本番DB、課金APIを呼ばない。
- 「実装済み・動作確認済み」は下記ローカル合成・モックテストで確認した範囲。実ユーザー・実モデル・本番RLS・本番E2Eの成功を意味しない。「実装済み・動作未確認」は静的確認のみ。「一部実装」は要求の一部だけ存在。「未実装」は調査範囲で該当経路がない。「確認不能」は必要な環境証拠がない。

### mainと本番を混同しない

監査開始時の取得済みproduction refは `d86115c7e1952c47fd56af77a4f44fd87933b48a`（#1187）。選択的リリースのためmainと同一でない。直前作業で確認されたVercel deploymentは `dpl_EtS1L7qyt1vPgDKpXXayrzifn4Se`、READY、production branch、公開URLは `https://www.watashi-works.com`。本監査では本番へ再接続していないため、これは引継ぎ証拠であり現在のDB状態やPilot開始済みという判定には使わない。

mainの#1176 OEM登録課金、#1178/#1179 Migration runner/probeは上記production refに未反映。mainのVercel buildは `db:migrate:vercel` を含む一方、productionの選択的releaseは `db:assert-ready` を使う。mainをそのままdeployすると未適用Migrationを巻き込む可能性がある。本監査・文書PRの承認はdeploy承認ではない。

## 2. 監査A: AI接続構造

実体は `apps/web/src/providers` のAdapterとApplication Port。仕様上の将来案 `packages/ai` は現存する共通Gatewayではない。以下の表でPは `apps/web/src/providers/`、Sは `apps/web/src/services/`、Jは `apps/web/src/jobs/` を指す。下表の17ファイルに加え、P`openai-fortune-reading-generator.ts` の `OpenAiFortuneReadingGenerator`（`fortune-daily-reading-v3-participant-memory`）もあり、計18のOpenAI Adapterファイルを確認した。占いは今回のサービス強化対象ではなく、共通設定変更の影響範囲としてのみ記録する（実装済み・動作未確認）。

| 項目                    | 実装ファイル・関数/クラス                                                                                                                                                                                   | 確認結果・判定                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 共通設定解決            | `apps/web/src/ai/runtime-provider-configuration.ts`: `resolveOpenAiRuntimeConfiguration`                                                                                                                    | 実装済み・動作確認済み。環境/Provider別のactive設定を解決。未登録時だけ環境変数へfallback。停止/予算超過をfallbackで回避しない                                              |
| Admin設定               | `packages/application/src/ai-provider-configuration.ts`: `CreateAiProviderConfigurationVersion`, `ActivateAiProviderConfiguration`, `PauseAiProviderConfiguration`, `ResolveAiProviderRuntimeConfiguration` | 実装済み・動作確認済み。version、接続検査、暗号化、停止、日次/月次予算あり。Service/OEM/task別モデル解決ではない                                                            |
| テキストモデル          | 同runtime、Pのdaily/weekly/strategy/proposal/video-plan各Adapter                                                                                                                                            | 一部実装。設定変更できるが複数Adapterの既定値は `gpt-5.2`。設定なしfallbackのrequestCostは0で、実費無料を意味しない。本番選択modelは確認不能                                |
| Daily/再Brief           | P`openai-daily-mission-planner.ts`: `OpenAIDailyMissionPlanner.generate`; P`openai-daily-mission-rebrief-planner.ts`: `OpenAIDailyMissionRebriefPlanner`                                                    | 実装済み・動作確認済み。Responses/構造化出力、Goal/Context、品質Gate。prompt versionは `daily-mission-planner-v11-goal-planning` / `daily-mission-rebrief-v1`               |
| 投稿文章/品質           | P`openai-mission-content-generator.ts`: `OpenAIMissionContentGenerator`; P`openai-mission-quality-checker.ts`: `OpenAIMissionQualityChecker`                                                                | 実装済み・動作未確認（今回単独Adapter試験なし）。独立Port・prompt version・timeout。生成成功と利用者採用は別                                                                |
| Weekly/Strategy         | P`openai-weekly-planner.ts`: `OpenAIWeeklyPlanner.generate`; P`openai-strategy-generator.ts`: `OpenAIStrategyGenerator`                                                                                     | Weeklyは実装済み・動作確認済み、Strategyは動作未確認。Weekly v8はGoal/Performanceを入力。両fetchに明示AbortSignalなし。共通timeout完備とは判定しない                        |
| 初期提案/他用途         | P`openai-bunshin-proposal-generator.ts`: `OpenAIBunshinProposalGenerator`; P`openai-member-product-suggestion-generator.ts`; P`openai-personality-learning-suggestion.ts`                                   | 実装済み・動作未確認。両サービス以外にも共通OpenAI設定の影響が及ぶ。proposalにも明示AbortSignalなし                                                                         |
| 学習評価                | P`openai-training-answer-evaluator.ts`: `OpenAiTrainingAnswerEvaluator.evaluate`; J`training-answer-evaluation-job-handler.ts`: `createTrainingAnswerEvaluationJobHandler`                                  | 実装済み・動作確認済み。`ai-training-evaluation-v3`、schemaとSkill Ruleで再検証。45秒timeout、Pilot token/byte上限、呼出し直前Gate・Admission・計測あり                     |
| 写真/スクリーンショット | P`openai-photo-first-analyzer.ts`: `OpenAiPhotoFirstAnalyzer`; P`openai-social-insight-extractor.ts`: `OpenAiSocialInsightExtractor`                                                                        | 実装済み・動作未確認。画像入力をResponsesへ渡す。60秒timeout。画像認識≠画像生成                                                                                             |
| 画像生成/画像品質       | P`openai-social-image-generation.ts`: `OpenAiSocialImageGenerationAdapter.generate`; P`openai-social-image-quality-review.ts`: `OpenAiSocialImageQualityReviewer`                                           | 実装済み・動作未確認。images/generations・editsは入力model、120秒timeout。品質評価は別text model/60秒。研修への接続や提供承認を意味しない                                   |
| 音声/知識取込           | P`openai-group-knowledge-extractor.ts`: `OpenAiGroupKnowledgeExtractor`; P`openai-video-narration.ts`: `OpenAIVideoNarration`                                                                               | 実装済み・動作未確認。文字起こしは `gpt-4o-mini-transcribe`、読み上げは `NARRATION_MODEL=gpt-4o-mini-tts` 固定。テキスト設定だけでは切替不能。各120秒/30秒timeout           |
| 動画                    | P`openai-video-plan-generator.ts`: `OpenAIVideoPlanGenerator`; FAL/Runway/Creatomate Adapter                                                                                                                | 一部実装。OpenAIは計画/ナレーション、外部Providerが生成/描画。汎用AIで動画を自作しているわけではない。今回は追加も実行もしない                                              |
| 検索/Tool Calling       | P`grok-x-trend-research.ts`: `GrokXTrendResearchAdapter`; S`weekly-trend-research.ts`; EXA/FIRECRAWL Adapter                                                                                                | 一部実装。Grok X/web search toolsと検索Providerの選択がある。全Adapter共通のFunction Calling/任意業務tool実行契約は未実装                                                   |
| Prompt管理              | 各Adapterの `*_PROMPT_VERSION` とschema、Package Rubric                                                                                                                                                     | 一部実装。版識別はあるが本文は分散。承認済みPrompt Registry/モデル比較datasetは未実装。版の集約を理由にDomain PromptをCoreへ移さない                                        |
| 共通レスポンス処理      | P`mission-provider-response.ts`: `readMissionProviderResponse`, `missionProviderFailure`, `missionTransportFailure`, `missionReasoningOptions`                                                              | 一部実装。Mission系のHTTP/未完了/JSON検証を再利用。`gpt-5-mini`系にreasoning low分岐。他modelのparameter適合を保証しない                                                    |
| エラー・再試行          | 上記helper、各Adapter、既存Job handler                                                                                                                                                                      | 一部実装。構造化エラー/Job再試行はあるがtimeout/HTTP処理は分散。失敗リトライで再課金可能。外部処理のexactly-once保証ではない                                                |
| 接続検査と互換性        | `apps/web/src/ai/secure-provider-configuration.ts`; Provider connection test                                                                                                                                | 一部実装。model存在/接続成功はschema、画像入力、tool、token parameter、品質を保証しない。全面モデル切替の検証Gate不足                                                       |
| 利用量・原価            | `packages/application/src/ai-call-observability.ts`: `validateAiCallMeasurement`, `estimateAiCallCost`; `packages/database/src/personal-learning-ai-call.ts`: `PrismaPersonalLearningAiCallRepository`      | 実装済み・動作確認済み（Personal Learningの構造化計測）。cached token/版付き料金/validation/latency、欠損UNKNOWNあり。全AI処理同一精度は一部実装                            |
| 全体利用ログ            | `apps/web/src/observability/ai-usage.ts`: `recordAiUsageSafely`; schema `AiUsageEvent`                                                                                                                      | 一部実装。workspace/bunshin/actor/task/model/prompt/token/cost/冪等キー。保存失敗はログに記録して生成を止めない。group/service/enrollmentの直接列なし。完全原価台帳ではない |

Provider候補の正本は `AI_PROVIDER_KEYS`（OPENAI/GROK/EXA/FIRECRAWL/CREATOMATE/FAL/RUNWAY）。Codex/Dots/Gemini/ClaudeのRuntime Adapterがあるとは扱わない。共通OpenAI modelを変更すると投稿計画・文章・学習評価だけでなく他機能にも波及する。

## 3. 監査B: 共通基盤・重複・分離

| 対象                           | 根拠                                                                                                                                                 | 判定・再利用と制約                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service/OEM AI設定             | `ServiceConfiguration`、`provider-configurations.ts`、`runtime-provider-configuration.ts`                                                            | 一部実装。Serviceの提供・画像/動画設定と環境別Provider credentialは別正本。任意OEM/task別text model選択は未実装                                            |
| 企業/利用者Knowledge           | `service-generation-knowledge-loader.ts`、`service-generation-knowledge-prompt.ts`: `businessProfileKnowledgeForPrompt`, `serviceKnowledgeForPrompt` | 実装済み・動作未確認（全loaderを今回実DBで実行しない）。企業profile/承認Knowledge/Grantを選択して入力へ投影                                                |
| Owner Knowledge/Bunshin Memory | `packages/database/src/bunshin-memory.ts`: `PrismaBunshinMemoryRepository`, `PrismaOwnerBunshinMemoryRepository`                                     | 実装済み・動作確認済み（owner repository試験）。Workspace/User/Bunshin条件・削除/利用可否を区別。共有Memory新設不要。Service safe modeでは利用経路が異なる |
| 会話履歴                       | `Learning Consultation` bounded state、`TrainingMissionAnswer`、Generation Context                                                                   | 一部実装。相談/回答/生成履歴は用途別。Personal Learningを長期汎用Chatとして保存・他Packageへ共有する経路はない。汎用会話統合は不要                         |
| 採否・利用行動                 | `daily-mission-learning-history.ts`: `summarizeMissionLearningHistory`; Mission decision/feedback/activity/variant selection                         | 実装済み・動作確認済み。採否・理由・履歴を要約。単発理由を恒久的な好みと断定せず、反復を区別                                                               |
| 学習履歴                       | `training-profile.ts`, `training-answer.ts`, `personal-learning-router.ts`, ProgramActionEvent                                                       | 一部実装。Plan/Assignment/Answer/Assessmentを再利用。外部AI Toolを本人が実際に操作した事実は自己申告と課題評価の組合せで、直接操作ログではない             |
| AI利用・課金                   | `AiUsageEvent`, Personal Learning AI Call event、OEM billing                                                                                         | 一部実装。AI原価と登録/実測利用のOEM請求単位は別。token使用数を登録人数に置換しない                                                                        |
| Admin                          | `apps/web/app/(app)/admin/ai/provider-configuration-editor.tsx`, Service manage improvement-feedback、OEM料金管理                                    | 実装済み・動作未確認（今回UIを操作しない）。接続検査/切替/停止に権限あり。モデル品質比較画面は未実装                                                       |
| Tenant/Service分離             | scoped repositories、Program Runtime、Pilot assessment/admission、Grant、複合FK/RLS migration                                                        | 実装済み・動作確認済み（合成拒否テスト）。本番RLS・実role・全経路の証明は確認不能。actor一致だけでService横断を許可しない                                  |
| 共通再利用                     | Application Port、Program Runtime、Job、Capability Contract、observability                                                                           | 実装済み・動作確認済み（該当unit）。重複の少ない実行正本を維持。Gateway新packageを先行しない                                                               |

重複候補は、Adapterごとのfetch/JSON/timeout/usage抽出、各Adapterのdefault model、Provider-global予算とPilot Admissionの並存、AiUsageEventとPERSONAL_LEARNING_AI_CALLの同一呼出し計測。最後の2件は責務が異なるため単純統合・削除しない。原価集計時に同じattemptを二重加算しない対応が必要。

## 4. 監査C: ハッシー

| 確認事項               | 経路・根拠                                                                                                                                    | 判定・次回反映                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 企業情報取得/保存/使用 | Service business profile → `loadServiceGenerationKnowledge`周辺loader → `businessProfileKnowledgeForPrompt` → `DailyMissionGenerationService` | 一部実装。登録された事実を生成入力へ渡す。外部企業情報の無条件収集・事実保証ではない                                                                                      |
| 投稿テーマ/文章        | `DailyMissionGenerationService`、Daily Planner、Content Generator、Quality Checker                                                            | 実装済み・動作確認済み（Daily/再Brief経路）。考える支援・本人採用を維持。自動SNS投稿代行と区別                                                                            |
| 週間計画               | `weekly-plan-generation.ts`: `createWeeklyPlanGenerationService` → `OpenAIWeeklyPlanner.generate`                                             | 実装済み・動作確認済み。直近28日Performance/Goal Outcomeを入力。自己申告/未測定/不足を識別、少数データで因果を断定しない                                                  |
| 採用・不採用理由       | `summarizeMissionLearningHistory` → loaderの `personalization.feedbackSummary` → `buildDailyMissionPersonalizationBase` → Planner             | 実装済み・動作確認済み（要約unit）。Daily生成の159–161/238–240付近でbehavior/feedback/performanceを実際に入力へ渡す。保存だけで終わらない。ただし出力改善効果は実測未確認 |
| 投稿実施/成果          | Post record/manual metrics → loader outcomeRecords、Weekly Performance                                                                        | 一部実装。本人の投稿記録/手入力を利用。SNS公開の自動照合・API実測が全てあるわけではない。観測時の元Goalを保持                                                             |
| 停滞の検知/再開支援    | `capability-social/src/activity-barrier*.ts`、DB barrier repository、web barrier scheduler/LINE scheduler                                     | 実装済み・動作確認済み（ルール/設定除外/配信対象モック）。システム障害日などの除外あり。本人確認/再開支援と単なる未利用を区別。本番送信成功は未確認                       |
| 個別Memory             | `daily-mission-planning-context.ts`: `loadDailyMissionPlanningContext`、Owner Grant/active memory                                             | 一部実装。許可・scope・Service safe modeを条件に入力化。全Memory常時共有や全履歴がLLMへ渡る設計ではない                                                                   |
| OEM支援情報            | DB`projectSocialActivityOemSupportCandidates`、support summary、email/LINE候補                                                                | 実装済み・動作確認済み（projection/候補試験）。確定barrier・介入後の観測から支援候補を作る。OEM閲覧を個人本文の共有や自動営業へ拡張しない                                 |

重要な限界: 「履歴を次回入力へ反映」と「利用者が採用する提案に改善した」は別。後者を示す同母数/同期間/同model比較は未実装。安全状態不明をPASSEDで補う改善は提案しない。

## 5. 監査D: マナベルスタイル

| 確認事項               | ファイル・契約/関数                                                                                                            | 判定・能力向上の確認範囲                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 学習目的               | `capability-training/src/learning-scope.ts`, `learning-consultation.ts`: `consultAiTrainingLearning`; Application Profile/Goal | 実装済み・動作確認済み。Scope→質問→候補→本人選択。CONTENT_REQUESTは学び方のSuggestion、CONSULTINGは対象外。自動Goal化しない                                                       |
| AI経験/職種/習熟度     | schema `TrainingParticipantProfile`、`training-profile.ts`、`learning-profile-goal.ts`                                         | 一部実装。role/aiLevel/dailyMinutes/useCases/topics/skillScoresが既存正本。Learner共通projectionとAI Packageを分離。UNKNOWN≠NONE、初心者≠未経験。Tool別全項目の保存はない         |
| 個別計画/保存          | Application `personal-learning-plan.ts`、DB`personal-learning-persistence.ts`                                                  | 実装済み・動作確認済み（Domain/selected regression）。Confirmed Goal参照、Plan revision、本人確認、版固定、CAS/冪等。本文教材をPlanへ埋め込まない                                 |
| 個別課題               | `packages/capability-training/src/learning-definition-fixtures.ts`、DB`personal-learning-router.ts`、既存Mission Bridge        | 一部実装。承認された3Definition→PROMPT_BASIC/PROMPT_CONDITION。Definition≠Mission。選択/順序の個別化であり、自由生成教材/全テーマ対応ではない                                     |
| 理解度/弱点            | `OpenAiTrainingAnswerEvaluator.evaluate`, `finalizeTrainingSkillEvaluation`, `AiTrainingV1Policy.evaluate`                     | 実装済み・動作確認済み。理解度/Skill/Barrierを構造化。提出Prompt評価は実務成果物品質・本人の再現能力の直接証明ではない                                                            |
| 過去回答/進捗/次回     | `routeAiTrainingLearning`（`learning-router.ts`）、既存Assignment/Answer/Assessment evidence                                   | 実装済み・動作確認済み。最新版PlanとDefinition/評価rule/日時/Skill evidenceを照合。PASS→NEXT、REVIEW/RETRY、欠損UNKNOWN、前提不足BLOCKED。古い回答全文を無制限に次のLLMへ渡さない |
| つまずき/操作支援      | Training Runtime/Barrier、Pilot UI、Guided Practice INTERACT/Support Level                                                     | 一部実装。既存課題・ヒント・再挑戦・本人選択あり。自動Teaching Personalization/自動支援量Routerは未実装                                                                           |
| 完成確認/First Success | `guided-practice.ts`: `validateGuidedPracticeCommand`, `definePracticeCompletion`; DB `PrismaGuidedPracticeRepository`         | 実装済み・動作確認済み（training契約）。本人操作申告/確認/有用性/検証済みAssessmentが必要。Enrollmentごとのfirst evidenceは一度。成果物本文をCoreへ保存しない                     |
| 再現性/応用/Capability | Guided Practice SELF_PROMPTED/SELF_EVALUATED/SELF_REVISED等、Capability Evidence                                               | 一部実装。Evidenceはあるが `capabilityLevel=UNKNOWN` / `outcomeQuality=UNKNOWN` を維持。1回の自己申告でLevel4/5や自力再現を確定しない                                             |
| Fit・利用後の反映      | Pilot Feedback/Telemetry、Router、V1 work result/Toolkit                                                                       | 一部実装。Fitと学習の結果は記録可能。旧V1 workUseCount/Toolkitは別経路。実務利用・別課題での自力再現をPersonal Learningへ検証済み接続したとは扱わない                             |
| 実学習UI/API           | P1-F Pilot HTTP、Profile Preparation、own internal preparation、既存回答/評価worker                                            | 実装済み・動作確認済み（HTTP/worker合成）。認証・allowlist/seat・Program・Provider前再認可。実スマホ/ログアウト復元/本番学習完走は確認不能                                        |
| 安全/原価/LINE         | Pilot gate、seat、call admission、assessment gate、LINE隔離                                                                    | 実装済み・動作確認済み（選択テスト）。Hard Cap/Wave/停止/日次・同時・byte・output制限を維持。停止済みでも送信済みProvider呼出しの即時取消は保証しない                             |

本人がCreatorで、サービスはTeacher/Coach、外部AIはTool。完成品の品質だけで能力向上を判定しない。旧30日V1のFIXED_DAYS/legacy assistanceとPersonal Learningを混同せず、旧互換を理由にマナベルスタイルを30日固定や代行制作へ戻さない。

## 6. 監査E: AI進化対応とOEM

| 機能                 | 判定                                | 現在の同等資産 / 不足                                                                                                                                                             |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI Gateway           | 一部実装                            | Port/Adapter、runtime設定、mission response helper。transport・token/usage・timeoutは未統一                                                                                       |
| Capability Registry  | 一部実装                            | `capability-contract/src/index.ts` は業務Capability/付与/Executor。モデルのvision/audio/schema/tool対応表ではない                                                                 |
| Capability Router    | 一部実装                            | trend Provider順序やmedia設定はある。text taskごとの検証済みmodel選択・費用比較は未実装。Learning Routerは学習経路でありモデルRouterではない                                      |
| Evaluation Engine    | 一部実装                            | Service別品質/Rubric/Skill Ruleと回帰試験。モデル変更前後の固定dataset・費用/品質比較・人間承認receiptは未実装                                                                    |
| Improvement Pipeline | 一部実装                            | `CollectImprovementObservations`、Package adapter、Feedback Review/Triage。REVIEWED≠APPROVED。`isImprovementInstructionEligible` は純粋条件だけで指示案生成・Codex実行ではない    |
| OEM提供ルール        | 実装済み・動作確認済み（main unit） | #1176: Hassy FREE実測利用/PAID登録、AI_TRAINING FREE禁止。PAID_BUNDLEを0円FREEと誤認しない。正式期間・履歴・将来cutoverの条件あり                                                 |
| OEM計測/管理         | 一部実装                            | R（登録）とA（FREE実測）のworkspace内unique user union、料金draft/publish/CAS/audit。全OEMへの本番適用・請求結果は確認不能                                                        |
| OEM別AI原価          | 一部実装                            | workspace/bunshin/taskログとPilot program-scoped計測。AiUsageEventにService/OEM関係の直接列はなく、所属履歴/呼出し時scopeで帰属させる契約不足。単純actor joinは越境・誤配賦リスク |
| 新AI機能と課金       | 実装済み・動作未確認                | Provider pricingとOEM登録単価は別正本。新modelを追加しても登録請求を自動変更しない。原価欠損を0円計上しない                                                                       |

## 7. Dots / Codexと公開仕様

2026-10-09確認の一次情報。外部仕様の確認と本Repositoryへの接続実装は別。

- [Codex GitHub連携](https://learn.chatgpt.com/docs/third-party/github): repo接続、レビュー呼出し、設定/権限が必要。AGENTS・CI・人間レビューは引き続き必要。今回接続/レビュー起動はしない。
- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk): server-sideからthread開始/継続等を扱える公開方式。本RepositoryにSDK/Adapterはない。SDKの存在は自動merge/deployの許可ではない。
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): 構造化回答とFunction Callingは別用途。schema適合だけで業務妥当性・学習能力を保証しない。
- [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices): 比較評価の参考。固定ケース・専門家レビュー・失敗例を残す方針を提案するが、今回実API evalを実行しない。
- [OpenAI dots Controls](https://learn.chatgpt.com/docs/dots/controls): Activityで結果を確認し、権限/承認/停止を管理する公開説明あり。ただしユーザーの「Dots」がこの製品か未回答。条件付き候補としてのみ扱う。この資料から自社APIでdotsを直接起動できるとは判断できない。

GitHub最小権限、利用プラン/組織policy、外部へのデータ送信承認、利用枠/費用上限、停止方法は導入前に人間が確認する。実契約/料金/利用可能機能は確認不能。開発支援は匿名化した再現条件/集計のみを人間が渡す方法から開始可能。ログ本文の自動送信、顧客会話/回答/成果物/secretの外部handoffは禁止する。

## 8. ローカル検証記録

Node 24、pnpm 10.10、Vitest 4.1.11。Provider fetch/Repository mockおよびpure test。DB統合試験・実API・ブラウザE2E・本番操作は行わない。

| 実行                                              | 結果                      |
| ------------------------------------------------- | ------------------------- |
| `pnpm --filter @bunshin/capability-training test` | 25 files / 288 tests PASS |
| `pnpm --filter @bunshin/capability-social test`   | 29 files / 305 tests PASS |
| Application選択9files                             | 167 tests PASS            |
| Web選択15files                                    | 131 tests PASS            |
| Database選択9files                                | 45 tests PASS             |
| Web履歴/Barrier追加5files                         | 9 tests PASS              |
| 合計                                              | 92 files / 945 tests PASS |

追加で `pnpm architecture:check` PASS、`pnpm test:architecture` 10 tests PASS。上記945件とは別計上。文書6ファイルはPrettierで整形した。

Application: `ai-provider-configuration`, `ai-provider-runtime-guard`, `ai-provider-operations`, `ai-call-observability`, `improvement-engine`, `improvement-feedback-triage`, `personal-learning-plan`, `personal-learning-call-admission`, `oem-registration-billing`（各`packages/application/test/*.test.ts`）。

Web: `ai-runtime-provider-configuration`, `mission-provider-response`, `openai-daily-mission-planner`, `openai-weekly-planner`, `openai-training-answer-evaluator`, `daily-mission-decision-context`, `daily-mission-rebrief-production-boundary`, `weekly-plan-generation`, `personal-learning-ai-call-provider`, `personal-learning-ai-call-worker`, `personal-learning-call-admission`, `personal-learning-line-isolation`, `personal-learning-pilot-http`, `improvement-feedback-review-service`, `improvement-feedback-review-http`（各`apps/web/test/*.test.ts`）。追加: `daily-mission-learning-history`, `social-activity-barrier-scheduler`, `social-activity-barrier-line-scheduler`, `social-activity-barrier-admin-summary`, `service-line-broadcast-barrier-eligibility`。

Database: `owner-bunshin-memory-repository`, `personal-learning-pilot-profile`, `personal-learning-ai-call`, `personal-learning-internal-owner`, `social-activity-oem-support-candidates`, `social-activity-oem-support-candidate-line`, `social-activity-oem-support-candidate-email`, `oem-commercial-module-boundary`, `oem-automatic-collection-schema`（各`packages/database/test/*.test.ts`）。

Vite configの将来native loader互換警告あり（非失敗）。試行した誤filter `@bunshin/web` は対象なしでテスト未実行のため件数に含めず、正しい`web`で再実行。全repoのlint/typecheck/build/test成功という判定はCI結果を別に参照する。本番Migration runnerがあるため監査目的でbuild/deployを呼ばない。

## 9. UNKNOWNと停止境界

現在本番model/Provider価格設定・API使用枠・RLS・Migration適用済み状態・実ユーザーPilot/学習完走・AI原価欠損率・OEM配賦精度・採用改善率は確認不能。Dots製品の確定も未回答。確認不能をPASSにしない。

設計提案は [Gap](CAPABILITY_GAP_ANALYSIS.md)、[Architecture](ARCHITECTURE_PROPOSAL.md)、[サービスRoadmap](HASHIEE_MANABERU_ROADMAP.md)、[実装計画](IMPLEMENTATION_PLAN.md)、[経営要約](EXECUTIVE_SUMMARY.md)。今回のPRは文書のみ。人間レビュー後の別指示まで実装しない。
