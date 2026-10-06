# P1-E Learning Router / Existing Mission Bridge

## 状態・変更単位

- 基準main: `15751e98029049048b74898406e84c298d5d6abc`（#1150）
- branch: `feat/personal-learning-router-bridge-v1`
- 実装commit: `5409ff9bda2c42bea80d19354f248c5b2168e9fe`。検証結果の文書追記commitはPR headで確認する。
- 対象: P1-Eのみ。server-internal opt-in Bridge。UI/API/LINE Schedulerへの登録、本番利用開始を含まない。

## 正本・責務

Core候補はapplicationの`learning-router.ts`に置いたResult/Bridge portのみ。AI Skill名・Mission名を持たない。AI Packageの`learning-router.ts`に3Definition限定の決定的Ruleを置く。新package/汎用Rule Engineを作らない。

DB adapter `PrismaPersonalLearningRouterBridge`はP1-C-S repositoryの認可transaction・承認読取・Plan復元を再利用するため、その3 helperだけをprotectedへ変更した。既存保存の挙動は変更しない。GoalはProgramMemberGoal、PlanはPersonalLearningPlanRevision、実行は既存ProgramMissionAssignment/TrainingMissionAnswer/ProgramActionEvent/ProgramProgressSnapshotが正本。

変更ファイル:

- application: `src/learning-router.ts`, `src/index.ts`
- capability-training: `src/learning-router.ts`, `src/index.ts`, `test/learning-router.test.ts`
- database: `src/personal-learning-router.ts`, `src/personal-learning-persistence.ts`, `src/index.ts`, `test/personal-learning-persistence.integration-cases.ts`
- docs: `DECISION_LOG.md`, 本報告

## Router Contract / states / reasons

Rule Version: `AI_TRAINING_LEARNING_ROUTER_V1`。入力は復元済みConfirmed Plan、expectedRevision、実Goal/Enrollment gate、人間承認済み版、Assignmentに紐づくAssessment Evidence。出力はstatus/reason/ruleVersion/definition。副作用のないPackage Ruleが選択し、DB Bridgeが明示操作で既存Assignmentを作成する。

| 状態           | 主な理由                                                                                                                        | 扱い                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| NEXT           | FIRST_REQUIRED_DEFINITION / ASSESSMENT_PASSED                                                                                   | 初回または必要Evidenceを満たした次のDefinition             |
| REVIEW         | ASSESSMENT_REVIEW_REQUIRED                                                                                                      | 既存AssessmentがREVIEW。理解度60以上でも要素の復習が必要   |
| RETRY          | ASSESSMENT_REVIEW_REQUIRED                                                                                                      | 既存AssessmentがREVIEWかつ理解度60未満。未習得として再挑戦 |
| BLOCKED        | PREREQUISITE_NOT_COMPLETED / PLAN_REVISION_CHANGED / DEFINITION_NOT_APPROVED / GOAL_NOT_ACTIVE / PLAN_NOT_CONFIRMED             | 安全gate不成立                                             |
| UNKNOWN        | ASSESSMENT_MISSING / SKILL_EVIDENCE_MISSING / SKILL_RULE_VERSION_UNKNOWN / MISSION_REFERENCE_MISMATCH / ASSESSMENT_INCONSISTENT | Evidenceなし・不整合。推測で進行しない                     |
| PLAN_COMPLETED | PLAN_COMPLETED                                                                                                                  | 必要DefinitionすべてPASS。状態変更の命令ではない           |

追加Bridge理由: RUNTIME_SCOPE_NOT_AVAILABLE、ASSESSMENT_PROFILE_MISSING、PRIMARY_GOAL_CONFLICT、EXISTING_ASSIGNMENT_ACTIVE、PROGRESS_SCOPE_MISMATCH、ASSIGNMENT_REFERENCE_UNKNOWN、EVIDENCE_LIMIT_EXCEEDED、REVIEW_EVIDENCE_MISSING、LEARNING_EXECUTION_PAUSED。Definitionを特定できない既存ProfileのneedsReviewを無視せずUNKNOWNとし、既存ProgressのPAUSEDも迂回しない。認可不成立/Enrollment利用不可はNOT_FOUND、同時更新はCONFLICTで拒否し、Assignmentを作らない。

## Definition Completion / Mission / Assessment Bridge

| Definition         | 前提             | 既存Mission      | 必要Skill         |
| ------------------ | ---------------- | ---------------- | ----------------- |
| PROMPT_STRUCTURE   | なし             | PROMPT_BASIC     | promptStructure   |
| CONTEXT_SETTING    | PROMPT_STRUCTURE | PROMPT_BASIC     | contextSetting    |
| CONSTRAINT_SETTING | CONTEXT_SETTING  | PROMPT_CONDITION | constraintSetting |

Definition版は`AI_TRAINING_DEFINITION_FIXTURE_V1`、Mission QualityとSkill Ruleは既存fixtureに固定。fixtureを自動承認しない。Service scopeの有効な人間APPROVED recordがなければ実行できない。

Completionには当該Definition/Plan RevisionのAssignment、READY Answer、evaluatedAt、同じ回答/actor/Assignmentに紐づくANSWER_EVALUATED audit、版付きevaluatedSkillKeys/skills/result/understandingの一致を要求する。PASSかつCOMPLETED、理解度と評価対象Skillが60以上で進行する。ProfileのSkill Score単独によるSkipは実装しない。

同一MissionでもDefinitionは別物。PROMPT_BASICがPASSしても両Definitionをまとめて完了にしない。それぞれ独立したAssignment・回答・評価を必要とする。WAIT/RECOVERYや版不一致をPASSに変換しない。

既存Mission Qualityを固定rendererで表示するだけ。新しいMission本文/教材/個別例/Hint/評価Providerを生成しない。実際の回答受付と評価Jobは既存経路を利用できる契約であり、今回そのUIやSchedulerを登録しない。

## Revision / idempotency / lifecycle / audit

- Enrollment lock + Serializable transaction内でscope5項目、本人、membership/User/Workspace/Group/Serviceの有効性・期間・削除済みgateを再検証する。実GoalはACTIVE、Primary Goalは1つ、最新Plan RevisionはCONFIRMEDのみ。
- `expectedRevision`不一致は停止。旧Revision EvidenceはUNKNOWNとして停止し、暗黙に新Revisionの習得証拠へ引き継がない。Revision後のEvidence移行/再学習を安全に決める操作は後工程。
- 新AssignmentはAPPROVEDのみ。DEPRECATEDは既存履歴を削除せず、新規作成を止める。再送receiptにも現在のGoal/Plan/承認gateを適用する。
- Assignment targetResourceType/Id + displaySnapshot内`personalLearning`へplanId/revision/Definition版/Router版の参照だけを付ける。Definition本文・相談全文をコピーしない。
- scoped操作idempotency keyは同一plan/revision/actorの再送receiptを返す。異なる内容へのkey再利用を拒否する。異なるkeyや同時リクエストでも未完了Assignmentがあれば新規作成しない。既存sequence uniqueと共有lockを維持する。
- 既存V1のPRESENTED/STARTED Assignmentは置き換えない。既存Progress pointerだけを既存実行へ接続し、新しいLearning Progressを作らない。
- Bridge作成eventに選択状態・理由・版を記録する。REVIEW/RETRYも同じ最小eventに記録。PLAN_COMPLETED eventはplan/revision単位で一度。大量のevaluation/UNKNOWN eventを保存しない。
- PLAN_COMPLETEDでもGoalをACHIEVEDにせず、Plan/Enrollmentを自動終了しない。契約期間と習得は分離する。

## Privacy / 非変更

保存するのはGoal/Plan/Definitionの参照・選択理由・実行事実だけ。相談全文、business context、Provider response、新しいMemoryは保存しない。既存Answerが保持する本人の課題回答は既存責務のまま。

DB schema/migration追加なし。本番migration未適用。隔離した使い捨てDBへ既存migrationを適用してテストした。UI/HTTP API/LINE/Provider/Codex追加なし。30日V1 Policy/選定/Scheduler/Assessmentのコードは変更しない。Routerを本番Cronへ登録しない。

## 検証

検証結果（2026-10-06）:

| 検証                                                           | 結果                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| application unit（P1-A/B/C/CS・Program Goal/Runtime含む）      | 796 passed                                               |
| capability-training unit（P1-A/B/C/D・Policy/Skill含む）       | 251 passed                                               |
| database unit（Assignment/Evaluation/既存V1含む）              | 838 passed                                               |
| PostgreSQL integration（P1-C-S/P1-E・既存Program Runtime含む） | 115 passed（`--testTimeout 30000`）                      |
| architecture check / architecture tests                        | 成功 / 10 passed                                         |
| application / capability-training / database typecheck・build  | 成功                                                     |
| application / capability-training / database lint              | 成功（DBのtype import/unsafe assertionを修正して再検証） |
| format check / diff check                                      | 成功                                                     |

Windowsで全体回帰と実DBテストを並行した初回はPrisma DLLのrenameがEPERMとなった。実DB検証終了後に生成/buildを分離して再実行した。テスト条件・安全gateは緩めていない。使い捨てDB/networkは検証後にID・task labelを照合して削除済み。本番DBへは接続していない。全体Web回帰/CIの最終状態はPRと完了報告を参照する。

テスト対象:

- 純粋Router: A〜J相当、共有Missionの独立Evidence、REVIEW/RETRY、Rule/Definition版、Skill欠落、前提不足、Draft拒否、read-only completion。
- 実PostgreSQL: 保存済みGoal/Confirmed Plan→既存Assignment→既存Answer submission→既存Assessment保存形式→次Definition→完了、再送、同時実行、cross-user/workspace/group/enrollment/membership、取消、承認失効、旧Revision、未検証audit、既存V1未完了保護。
- Assessmentはsynthetic結果を既存保存形式で投入する。実課金Providerは呼ばない。既存Assessment Jobそのものの実Provider動作・実UI利用は本PRの検証範囲外。
- P1-A/B/C/D/CS、AI Training Policy/Assignment/Evaluation/Skill/Program Runtimeの既存suite、architecture/typecheck/lint/build。

## 未実装・次Phase条件・rollback

UI/LINE接続、Teaching Personalization、Learning Memory、Definition Factory/Codex、新Definition、SkillからのSkip、自動Goal/Plan変更、既存V1への自動backfillは未実装。P1-E人間レビュー後の別指示が必要。

実UIでの縦Loop開始には、対象Serviceの人間によるDefinition承認、本番P1-C-S migrationの別承認、本人確認済みPlan、既存Profileと有効な既存Runtimeが必要。既存の評価時はAssignmentのSTARTED事実を先に作る通常学習経路を維持する。旧Revision Evidenceは現行Planへ自動移植しない。

rollbackはこの独立PRのrevert。schema/migration追加がないためDB破壊的rollback不要。もし将来明示Bridgeを利用した場合は履歴を保持し、呼び出しを停止する。Plan/Goal/Answerを削除して戻さない。
