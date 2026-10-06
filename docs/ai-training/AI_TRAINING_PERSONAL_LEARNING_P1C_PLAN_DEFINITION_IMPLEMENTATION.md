# Personal Learning P1-C Plan / Learning Definition 実装報告

- 基準main: `74acfa9c50023013c1034c92a21fa0336670139c`（P1-A/P1-B反映済みlatest mainをfetch）
- branch: `feat/personal-learning-plan-definition-v1`
- 実装commit: `fa39100c1474c1e46a1e75386492091ad4ff82ec`。本報告は後続文書commitで追加するため、PR headとは区別する。
- 状態: 今回の人間指示による純粋Domain契約と3 review fixtureだけ。旧P1-C永続化を延期し、P1-C-S保存候補を人間レビュー後に検討する。
- 正本: [更新Target Architecture](03_AI_TRAINING_PERSONAL_LEARNING_TARGET_ARCHITECTURE.md)、[更新Implementation Plan](04_AI_TRAINING_PERSONAL_LEARNING_IMPLEMENTATION_PLAN.md)、[P1-B報告](AI_TRAINING_PERSONAL_LEARNING_P1B_PROFILE_GOAL_IMPLEMENTATION.md)と今回の指示。

## Learning Definitionへの設計変更

DefinitionはSkillを教える設計図で、完成教材ではない。Learning Definition Libraryを中心にし、完成教材の事前大量準備を必須にしない。固定する骨格はSkill / Objective / Prerequisite / Core Concepts / Safety・Boundary / Common Mistakes / Practice Pattern / Evaluation Rubric参照。個別化する説明量/表現/具体例/練習/Hint/復習/難易度は別責務。

Skillは「何ができるか」、Definitionは「そのSkillのために何を学ぶか」、Missionは本人が行う具体的練習、Contentは骨格のPresentation。SkillとDefinitionを1:1固定せず、既存Missionと複数Definitionの対応も表せる。PlanはDefinitionの選択/順序/前提の経路であり、教材本文や個人向け生成説明/例/Hint/回答/Manualを持たない。

将来のDefinition Factoryは、欠けたDefinition→構造化Draft（Skill分解/Objective/Prerequisite/Concepts/Safety/Mistakes/Practice/Rubric Draft）→Validation→Human Review→Approved Definition。Codex等はDraft支援のProvider候補で、Content生成は承認済み骨格に基づく下位候補。自由なTeaching、成果物制作、実務代行、コンサルへ拡張しない。今回Factory/Codex/Teaching/Content生成は未実装。旧Decisionは削除せず、新Decisionを追記した。

## Coreの最小Contract

`packages/application/src/personal-learning-plan.ts`へ追加し、既存applicationの公開exportsを使う。AI固有名称、Provider、DB、UIへの依存なし。新package/Registry/SDKは作らない。

- `LearningDefinitionReference`: packageKey / definitionKey / version。意味はPackage側。余分な本文fieldを拒否し、参照をcopy/freezeする。
- `PersonalLearningPlan`: contractVersion=`PERSONAL_LEARNING_PLAN_V1`、ruleVersion、planId、revision、previousRevision、revisionReason、Learner scope、P1-B Confirmed Goal、ordered steps、Plan status/confirmation。
- step: Definition参照、prerequisite参照、selection reason codeだけ。リスト順をOrderとし、未使用step ID/巨大createdFrom metadataは作らない。Goal参照とpreviousRevisionが最小の作成元を表す。
- reason: INITIAL / GOAL_CHANGED / SKILL_ALREADY_MASTERED / PREREQUISITE_REQUIRED / REVIEW_REQUIRED / LEARNER_REQUEST。具体的なAI理由はCoreへ入れない。

GoalはP1-BのConfirmedLearningGoalReferenceに限り、既存Goal ID/status/意味版と本人/scopeを照合する。Candidate/既存未確認参照/P1-A Suggestionは拒否。DRAFT/CONFIRMED Planでは既存Goal ACTIVEを要求するが、ACTIVEから本人確認を推定しない。

PlanはDRAFT（confirmation=null）とCONFIRMED / SUPERSEDED / COMPLETED（同planId/revision/本人のconfirmation）を区別する。Goal確認とPlan確認は別。契約validatorは信頼できるcallerのreceiptを検証するだけで、本人認証/承認操作/保存/実行権限を提供しない。本人の自己申告JSONを直接証跡として使わない。既存DBから確認証跡を読み取る実装も追加していない。

## Revision / prerequisite / 境界

初版はrevision=1、previousRevision=null、INITIAL。後続は同planId・直前revision参照・INITIAL以外。`definePersonalLearningPlanRevision`は前後を検証して新DRAFTを返すだけで、旧Planを変更/上書き/自動SUPERSEDED化しない。Goal ID/意味版が変わった場合だけGOAL_CHANGED。新Revisionへ前の本人確認を引き継がない。

Definition参照は版を固定し、重複path node/前提重複、計画内のself/cycle/後続参照、cross-Packageを拒否する。経路外のprerequisiteも参照として表現できるため、将来基礎省略/既習得を検討できる。ただし外部参照の存在・習得・安全性はUNKNOWNであり、渡されたreason codeを証拠にしない。Coreは実Definition Library/Skill evidenceの解決や、Packageが要求する前提の一致を検証するRegistryではない。

Plan/参照/step/確認に余分なfieldを入れた場合は拒否し、Goal/Scopeも必要項目だけを再投影する。1経路1〜100 node、各prerequisite最大100、参照/理由code最大80文字、identity最大200、revisionは正のsafe integer。副作用なし・immutable snapshotで、更新CASを実装したことにはならない。

Plan COMPLETEDはEnrollment終了やGoal ACHIEVEDを意味しない。startsAt/endsAt/契約期間を持たず、既存Goal/Enrollmentを更新しない。SUPERSEDED/COMPLETEDはPlanの履歴状態で、Program Runtime lifecycleの置換ではない。

## AI PackageのDefinition review fixture

`packages/capability-training/src/learning-definition-fixtures.ts`に3個だけ追加。版は`AI_TRAINING_DEFINITION_FIXTURE_V1`。既存qualityを読取投影し、Skill refは既存Skill Rule版、Rubric refはMission quality版を明示する。巨大Registry/Approved Library/教材制作ではない。

| Definition         | 既存Skill key     | 既存Mission      | 固定前提         |
| ------------------ | ----------------- | ---------------- | ---------------- |
| PROMPT_STRUCTURE   | promptStructure   | PROMPT_BASIC     | なし             |
| CONTEXT_SETTING    | contextSetting    | PROMPT_BASIC     | PROMPT_STRUCTURE |
| CONSTRAINT_SETTING | constraintSetting | PROMPT_CONDITION | CONTEXT_SETTING  |

Objective/Common Mistakesは対応する既存qualityの値を再利用する。Concepts/安全境界/一般Practice Patternは小さなreview案で、個人例・実際の練習本文・Hint・事業Scenarioは含めない。PROMPT_BASICは2 Definitionに対応し、Skill名・Definition key・Mission keyは別。既存Catalog/品質/採点関数/Prompt Versionを変更しない。前提設定や学習品質は専門家未レビューで、本番承認済みDefinitionとは扱わない。

仮想SalesはCore unit fixtureでSALES_TRAINING / HEARING Goal / HEARING_BASIC Definitionを同契約で表現しただけ。Sales Package/教材/Ruleは実装していない。

## 変更ファイルと検証

- `packages/application/src/personal-learning-plan.ts` / `src/index.ts`: Core契約と公開export。
- `packages/application/test/personal-learning-plan.test.ts`: Plan/確認/Revision/版/前提/本文/Scope/Salesの否定・肯定テスト。
- `packages/capability-training/src/learning-definition-fixtures.ts` / `src/index.ts`: AI構造fixtureと公開export。
- `packages/capability-training/test/learning-definition-fixtures.test.ts`: 既存quality/Skill/Mission対応、固定骨格、参照だけのPlanの検証。
- Target Architecture、Implementation Plan、Decision Log、本報告書。既存監査の時点情報/Decisionは保持。

検証環境はNode 24.19.0 / pnpm 10.10.0。以下は成功した。

- application全テスト: 129 files / 792 tests（P1-A/P1-B・Program関連を含む、今回追加47 tests）。
- capability-training全テスト: 19 files / 191 tests（今回追加6 tests）。
- `pnpm architecture:check`と`pnpm test:architecture`: 境界check成功、10 tests成功。
- 対象2packageの`typecheck` / `lint` / `build`: すべて成功。開発中の配列型narrowingの指摘は型付き参照を維持して修正し、抑制設定は追加していない。
- Repositoryの`pnpm format:check`と変更ファイルの最終Prettier check、`git diff --check`: 成功。

合計993 tests成功（今回の新規53を含む）。対象2packageとarchitectureの検証は全Repositoryのtypecheck/lint/test/build、実DB/本番確認とは区別する。Provider/実UI/実端末/教育効果検証は実施しない。GitHub CIはpush後に別途確認し、ローカル成功からCI成功を推定しない。

## 保存専用PRへの引継ぎ / P1-D・P1-E

保存前にGoal意味版とIDの明示リンク・本人確認証跡、Plan identity/Revision/前版・理由・immutable pathとDefinition版、同Revision確認・失効/完了の監査、primary唯一性、scope/削除世代/期間、CAS・idempotency・保持/Export/削除inventoryをレビューする。Plan本文を既存Event JSONへ新正本として押し込まない。新schema/Prisma/保存Port/CASは今回作っていない。

P1-Dの相談/Goal候補/Plan提案UI・APIは保存/承認の別レビュー後。LLMやDynamic Teachingを同時に追加しない。P1-EではApproved Definitionの存在/意味版/固定前提/Rubric、実習得証拠、Goal/Planの現行Revision・承認・認可・受講期間を再検証してから既存Mission/Assignmentへ接続する。fixtureとPlan CONFIRMEDだけで実行してはいけない。未確認はUNKNOWNを維持する。

DB/schema/migration/永続化/UI/API/Provider/LINE/課金/LLM/Codex/Factory/Teaching/Mission生成/Router接続はすべて未実装。既存30日V1・Enrollment/Assignment/Event/Progress/Skill Exposureの挙動を変更せず、実行正本を維持した。元dirty checkoutは変更していない。

rollbackは未接続の新contract/fixture/exportと文書をrevertするだけ。DB操作・復元・既存受講者移行は不要。本PR完成で停止し、merge/deploy/次工程は人間レビュー後の別指示を待つ。
