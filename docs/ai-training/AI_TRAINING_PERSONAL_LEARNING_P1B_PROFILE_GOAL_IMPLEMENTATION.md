# Personal Learning P1-B Profile / Goal最小契約 実装報告

- 基準main SHA: `091b81a53862a8972a3aae172caee359793e4fd1`（P1-A PR #1145を含む最新mainをfetch）
- branch: `feat/personal-learning-profile-goal-v1`
- 実装commit: `0ad93d419e235ad3f4c24f7534de031d9894f364`。本報告は後続文書commitで追加し、最終PR headは完了報告に記録する。
- 状態: P1-Bのみ。未接続の読取projection/純粋契約。P1-C、保存、Runtime接続、本番開始は未承認。
- 正本: [実装計画P1-B](04_AI_TRAINING_PERSONAL_LEARNING_IMPLEMENTATION_PLAN.md#p1-b-profileとgoalの最小契約)、[3層設計](03_AI_TRAINING_PERSONAL_LEARNING_TARGET_ARCHITECTURE.md)、[P1-A報告](AI_TRAINING_PERSONAL_LEARNING_P1A_SCOPE_IMPLEMENTATION.md)と今回の人間指示。

## 調査した正本と既存処理

Profile正本は`packages/database/prisma/schema.prisma: TrainingParticipantProfile`。保存は`packages/database/src/training-profile.ts: PrismaTrainingParticipantProfileRepository.save`。本人/Workspace/Service/Enrollmentを検証し、受講lock・Serializable・idempotency Eventを使う。今回この処理は変更していない。

Goal正本は同schemaのProgramMemberGoal。ProgramGoalDefinitionは再利用可能な目標定義であり本人Goalとは別、ProgramMemberPreferenceは支援mode/notesの正本である。`packages/application/src/program-goals-core.ts`の契約と`apps/web/src/http/program-goals.ts`の実保存も確認した。支援modeを説明の深さ・性格・習得度として再解釈しない。

旧初期設定は`TRAINING_GOAL_KEYS`と`recommendedTrainingGoalKeys`で候補を提示し、Profileの`learningGoalKey`とCatalog版を保存する。同transactionで既存ACTIVE GoalをCANCELLEDへ変更し、Catalog labelをProgramMemberGoal.titleにして新Goalを作る。dueAtはEnrollment.endsAt由来、数値ACTION=1/単位「習得」は教育成果の証明ではない。

既存一般Goal APIも旧ACTIVEをCANCELLEDにして新行を作る。旧行は消さない。初期設定Event/既存Program AuditとGoal行を履歴の正本として維持する。既存migrationの`program_member_goals_active_key`はEnrollmentごとのACTIVE一意性を持つが、新projectionは複数ACTIVEの入力も推測選択せず拒否する。

ProfileはGoal IDを持たず、Goal rowはAI Catalog key/semantic版を持たない。label一致だけで両者を結合してはいけない。今回の参照contractはGoal ID/定義IDを維持し、意味版・本人確認を自動補完しない。

## Profileの分類と最小投影

| 既存情報 / 将来候補                                                      | 判定                                  | 今回の扱い                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------- |
| dailyMinutes（5/10/15）                                                  | そのまま再利用 / typed projection可能 | 共通Learner preferredDailyMinutes。欠落Profileはnull                         |
| 現在Goal / 旧Goal                                                        | typed reference可能                   | ProgramMemberGoal ID/定義ID/既存statusのみ。本文・dueAt・metricを複製しない  |
| aiLevel、aiUseCases、preferredTopics、learningGoalKey、assessmentVersion | そのまま再利用 / typed projection可能 | AI Package側の既存Catalog契約。未知版/keyは拒否、自由文をkeyと偽装しない     |
| role、workChallenges、workContext、skillScores、review/count類           | 既存正本を維持                        | 今回のProfile最小投影から除外。削除/意味変更しない。個社分析へ転用しない     |
| ProgramMemberPreferenceのmode/notes                                      | 既存正本を維持                        | Learning preference/説明深度に無理に変換しない。新projectionへ本文コピーなし |
| AI経験 / Tool別経験                                                      | 保存拡張が必要                        | UNKNOWN/NONE/SOMEのPackage契約のみ。既存値から推定しない                     |
| ChatGPT/Gemini/Copilot/Image/Video/Automation/Agent経験                  | 保存拡張が必要                        | 個別field/Registryは未追加。必要になった項目だけP1-C以降でレビュー           |
| Difficulty/Explanation Depth/Active Learning State                       | 必要性と保存先の検討が必要            | 先回り追加なし。Mission難易度/Enrollment状態と混同しない                     |

共通`LearnerProfileProjection`はcontractVersion、認可済みscope、preferredDailyMinutes、currentPrimaryGoalRefだけ。汎用Personal Profile、業務KPI、性格/人事評価項目を持たない。paceはCoreで正の整数1〜120分、AI V1 adapterでは既存5/10/15だけを受け入れる。

`AiTrainingProfileProjection`は同scopeとsourceProfileId、catalogVersion、aiLevel、aiExperience、aiUseCases、preferredTopics、learningGoalKeyだけ。配列をcopy/freezeする。Profileなしの未回答nullと、保存済みの空配列を区別する。BEGINNER/INTERMEDIATEはlevelであり経験状態ではない。NOT_YETは「仕事で未使用」で、AI未経験NONEの根拠ではない。現行adapterは経験をUNKNOWNにする。NONE/SOMEは将来の明示回答を表す契約で、今回保存/推定しない。

`projectAiTrainingLearnerProfiles`は渡された認可済み既存行を読み取るだけ。共通/AI投影は派生値で更新API/DB正本ではない。Workspace/Service（groupId）/Enrollment/Membership/Userを照合し、private workContextやGoal本文は出力しない。Repositoryの認可を代替しない。

## Learning Goal contractと本人確認

- `LearningGoalSemanticReference`: packageKey / goalKey / version。CoreにはAI固有名称やProvider名をhardcodeしない。AI Package adapterは既存Catalog V1/keyを照合して参照を返すだけ。
- `ExistingLearningGoalReference`: kind / scope / ProgramMemberGoal ID / goalDefinitionId / status。statusは既存ACTIVE/ACHIEVED/PAUSED/CANCELLEDを保持し、COMPLETED等の新lifecycle enumを作らない。既存ACTIVE参照は確認証拠のない参照であり、Confirmed型ではない。
- `LearningGoalCandidate`: CANDIDATE / scope / semanticRef / scopeDecision。入力済み候補の純粋検証だけで、自然文からの生成を行わない。P1-Aの単一LEARNING・確認待ちなし・Suggestionなしを必要条件にするが、これだけでは本人確認を意味しない。
- `ConfirmedLearningGoalReference`: 既存参照と意味版に対する明示的LEARNER_CONFIRMED receiptを照合した別型。本人User、Goal ID、scope、package/key/versionが一致しない場合は拒否。候補を既存参照/Confirmedとしてcastした入力もkindチェックで拒否する。

確認validatorは本人操作を実行/認証/保存する関数ではない。信頼できる将来のcallerが本人確認とGoal意味の紐付けを検証したreceiptを渡す前提。本人入力の「確認しました」文字列や自己申告JSONを直接証拠として採用しない。現行行から確認証拠を読み出す機能も追加していないため、既存Goalを自動昇格しない。

P1-AのCONTENT_REQUEST/AUTOMATION_REQUEST Suggestion、CONSULTING/OUT_OF_SCOPE/LEARNING_SUPPORT、未判定/混合からCandidate/Confirmedを作れない。別途明示されたLEARNING希望と本人確認を必要とする。Goalを自由文/AI出力で自動確定せず、Goal本文の二重正本を作らない。

## Primary / 履歴 / Enrollment / 横展開境界

`selectPrimaryLearningGoalReference`は同scopeの既存参照からACTIVEを最大1つ選ぶ読取Rule。重複ID/複数ACTIVE/cross-scope/Candidateを拒否。CANCELLED/ACHIEVED/PAUSEDはgoalHistoryとして保持し、旧行の削除/取消/更新を行わない。新しいPrimary保存や同時確認のDB制御は実装していない。

Goal投影はdueAt/startsAt/endsAt/Enrollment statusを受け渡さない。期限からACHIEVEDを作らず、Goal達成から契約終了を作らない。ProgramMemberGoal.status=ACHIEVEDもAI Skill習得認定として再解釈しない。

仮想Salesのgoal semantic参照を同じCore候補型で表せることをfixtureで確認しただけで、Sales実装はない。AI経験はPackage側で、共通ProfileにexperienceやTool fieldを押し込まない。将来Sales経験も別Package契約で検討する。全User共有ProfileやBunshin Memory同期は作らない。

## 変更ファイルと検証

- `packages/application/src/learning-profile-goal.ts` / `src/index.ts`: 共通typed contract/純粋検証/既存Goal参照。
- `packages/application/test/learning-profile-goal.test.ts`: 新33件。
- `packages/capability-training/src/learning-profile-goal.ts` / `src/index.ts`: AI Package投影/Catalog参照/経験契約。
- `packages/capability-training/test/learning-profile-goal.test.ts`: 新33件。
- `docs/DECISION_LOG.md`と本報告書。新package/依存追加なし、既存公開exportsを使用。

Node 24.19.0でapplication全128ファイル/745テスト、capability-training全18ファイル/185テストが成功。Program Goal/Training Profileの既存schema/boundaryテスト2ファイル/5件、Web program-goals-http 61件も成功。実DB統合ではなくfixture/静的境界/HTTP mock試験である。Architecture checkと否定テスト10件、対象2package typecheck/lint/build、全体`pnpm format:check`、変更8ファイルPrettier check、`git diff --check`、本報告のローカルリンク検査も成功。

新テストは既存Profile互換、UNKNOWN/NONE、Core/Package field分離、旧5 Goal/Catalog/職種推薦、Candidate/確認receipt、Primary1つ、CANCELLED履歴、期間非投影、Suggestion/CONSULTING拒否、意味版照合、越境、immutable出力を含む。全Repositoryのtypecheck/lint/test/buildや実Provider/本番UIは未実行で、対象検証やGitHub CIと区別する。

## 未実装・P1-Cへの引継ぎ・rollback

DB/schema/migration/UI/Provider変更なし。既存初期設定、Goal保存/取消、30日V1 Runtime/選定/評価/LINE/Exposure/Enrollment期間は未変更。新関数は既存HTTP/Runtimeから呼び出さない。元dirty checkoutへ変更していない。

P1-Cへ残すのは、既存Goal IDとAI意味版の明示リンク、本人確認receiptの保存/検証、必要になった経験/希望の保存先、Goal変更時の意味版履歴、Primary同時更新制御。既存Event metadataに任意本文や新正本を押し込まず、最小additive保存案・CAS・参照整合性を別承認で検討する。今回Plan/Revision/CAS/idempotency/LLM/Consultation/Memory/Router/Factoryには着手していない。

rollbackは未接続の新contract/adapter/export/文書のrevertのみ。DB復元・migration・既存Goal変更は不要。P1-B PR作成後に停止し、merge/deploy/P1-C開始は行わない。
