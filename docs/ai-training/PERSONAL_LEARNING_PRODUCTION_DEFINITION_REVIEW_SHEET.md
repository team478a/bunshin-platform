# Production Closed Pilot: 3 Definition人間レビュー票

2026-10-07追記: 本番準備APIは#1161/P1-Hで固定authority・Pilot停止中に限り利用できる契約へ拡張済み。下記の非production限定記述は旧時点の履歴。[最新開始前Gate](PERSONAL_LEARNING_PRODUCTION_WAVE0_FINAL_READINESS.md)を併用する。API実装は教育レビュー・本番承認の代替ではなく、下記3件の人間判断をAIが補完しない。

基準main `b462cdb9320cdfae2522f43e7ae4620cb02016d3`。**3件とも未レビュー・未承認（UNKNOWN）。本書はAPPROVE操作ではない。** [開始Runbook](PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT_RUNBOOK.md)と併用する。

正本: `packages/capability-training/src/learning-definition-fixtures.ts`、`mission-quality.ts`、`skill-evaluation.ts`、`learning-router.ts`。運用時は対象release SHAと管理APIのreviewDigest/revisionを再取得し、表だけで承認しない。

## 固定版・教育設計

2026-10-09再照合: main `600a336aa6f88bec46334632d0094bb4acfa697a` の `learning-definition-fixtures.ts` と `mission-quality.ts` で下表の3件・版・Objective・prerequisite・concepts・practice・Mission対応を確認した。レビュー判断は引き続き3件ともUNKNOWN。この照合は教育承認でも本番APPROVEでもない。

人間への今回の確認は、(1)本人がAIを操作する学習として妥当か、(2)CONTEXT_SETTINGの同一Mission再利用を独立Stepとして許容できるか、(3)現Rubricで構造/背景/条件を区別して評価できるか、(4)機密情報を使わず実践できるか、の4点。判断は末尾表へAPPROVE / REJECT / REVISION REQUIREDと理由・対象releaseを記録する。未記入を合格へ補完しない。

全Definition packageKeyはAI_TRAINING、versionは `AI_TRAINING_DEFINITION_FIXTURE_V1`。Skill版 `AI_TRAINING_SKILL_RULES_V1`、Rubric/Mission Quality版 `AI_TRAINING_MISSION_QUALITY_V1`、Router版 `AI_TRAINING_LEARNING_ROUTER_V1`。版・scopeの不一致は利用不可。

| 項目                           | PROMPT_STRUCTURE / 指示の基本構造                                                              | CONTEXT_SETTING / 背景情報の設定                                                  | CONSTRAINT_SETTING / 条件の指定                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Target Skill                   | promptStructure                                                                                | contextSetting                                                                    | constraintSetting                                               |
| Learning Objective（現コード） | 背景・目的・依頼を分けて指示できる                                                             | 背景・目的・依頼を分けて指示できる（PROMPT_BASICから継承。専用Objectiveではない） | 回答の品質を左右する条件を具体的に指定できる                    |
| prerequisite（同固定版）       | なし                                                                                           | PROMPT_STRUCTURE                                                                  | CONTEXT_SETTING                                                 |
| Core Concepts                  | 背景、目的、依頼範囲                                                                           | 対象、背景情報、目的との関連                                                      | 条件、測定可能性、一貫性                                        |
| Common Mistakes                | 依頼だけを書く／背景と目的が同じ内容になる                                                     | 依頼だけを書く／背景と目的が同じ内容になる（同Missionから継承）                   | 「いい感じに」だけで指定する／条件を増やしすぎて矛盾する        |
| Practice Pattern               | 用途に合わせて背景・目的・依頼を分けたPromptを本人が組み立てる                                 | 用途に必要な背景情報を選び、機密情報を除いたPromptへ追加する                      | 用途に必要な条件を選び、具体的で矛盾しないPromptを本人が作る    |
| Evaluation Rubric              | PROMPT_BASIC: 指示構造、背景設定、依頼の実行可能性                                             | PROMPT_BASIC: 指示構造、背景設定、依頼の実行可能性                                | PROMPT_CONDITION: 条件指定、測定可能性、条件の一貫性            |
| Safety（3件共通）              | 本人が学ぶ。実務代行や完成成果物制作なし／個人情報・社外秘を練習へ入れない／AI出力を本人が確認 | 同左                                                                              | 同左                                                            |
| Legacy Mission                 | PROMPT_BASIC                                                                                   | PROMPT_BASIC                                                                      | PROMPT_CONDITION                                                |
| 現Mission課題                  | 背景、目的、依頼内容の3点を含むAIへの指示を書く                                                | 同じ課題。Definition別の専用本文ではない                                          | 対象、長さ、文体、注意点から2つ以上を選び指示へ追加             |
| 成功条件・制約                 | 背景/目的/実行可能な依頼。3点を区別し依頼は1つ                                                 | 同左                                                                              | 条件が具体的で目的と矛盾しない。2つ以上、数値化できる条件は数値 |

## Teaching Guideと人間の確認点

現fixtureに独立したteachingGuide fieldはない。下記は**人間レビュー用ガイド案**であり、実装済み個別Teaching・教材・追加Definitionと称しない。現在の実行は既存Mission本文を表示するだけで、LLM説明生成はない。

- PROMPT_STRUCTURE: 背景/目的/依頼を分ける観点を確認し、本人が1つの指示を組み立てる。完成した仕事の代行結果をシステムが作らない。
- CONTEXT_SETTING: 前提の構造を維持して、対象と目的に必要な背景の選択を確認する。PROMPT_STRUCTUREと同じ課題を再度使うため、背景に焦点を当てた復習として理解できるか、独立したStepと評価が教育上妥当かを重点レビューする。
- CONSTRAINT_SETTING: 目的との整合と数値化可能性を確認し、条件を2つ以上追加する。制約の多さではなく一貫性を見る。

現在RouterのCompletionは、同scope/Plan revision/Definition version/既存Mission Quality版のAssignmentと、READY Answer + ANSWER_EVALUATED事実の一致を要求する。Profile scoreだけでは不可。Rule版と対象Skill evidenceが存在し、PASS、Assignment COMPLETED、understanding>=60、**evaluatedSkillKeysの全score>=60**で次へ進む。Definitionの対象Skill1個だけの合格ではない。

REVIEWかつSKIPPEDはunderstanding<60ならRETRY、それ以外はREVIEW。未評価/不正/版違いはUNKNOWN、前提不足はBLOCKED。Plan完了はGoal達成・Enrollment終了・研修修了ではない。人間はRubricと対象Skill、Provider評価品質と進行Ruleの整合を確認する。教育設計に不足があればREVISION REQUIREDとし、既存版の内容を黙って書き換えない。

## 人間判断・承認記録（空欄はUNKNOWN）

| Definition         | 判断（APPROVE / REJECT / REVISION REQUIRED） | Reviewer / 日時 | 対象release SHA / reviewDigest / revision | 非公開証跡キー / 修正理由 | 本番承認操作receipt |
| ------------------ | -------------------------------------------- | --------------- | ----------------------------------------- | ------------------------- | ------------------- |
| PROMPT_STRUCTURE   | UNKNOWN                                      | 未記入          | 未記入                                    | 未記入                    | 未実施              |
| CONTEXT_SETTING    | UNKNOWN                                      | 未記入          | 未記入                                    | 未記入                    | 未実施              |
| CONSTRAINT_SETTING | UNKNOWN                                      | 未記入          | 未記入                                    | 未記入                    | 未実施              |

本人がObjective/prerequisite/concepts/safety/mistakes/practice/rubricAndMissionを確認する。Codexはchecklistをtrueへ補完せず承認しない。判断者の記録と同Serviceの現ACTIVE SERVICE_OWNER/ADMINによる承認操作を区別する。GETレビュー後POSTは既存明示確認・CAS・idempotency・監査を用いるが、現管理APIは非production専用。本番対応PRと別操作承認が通るまで本番APPROVEを行わない。REJECT/REVISION REQUIREDは人間記録に残し、既存承認の取消が必要な場合だけ別のDEPRECATE操作を承認する。
