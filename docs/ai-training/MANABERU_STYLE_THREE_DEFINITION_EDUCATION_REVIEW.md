# マナベルスタイル — 3Definition教育レビュー一括報告

2026-10-09 JST。基準main `79d9b855d73f44f9ae0deb4ec55d80365c6aac9e`（#1206）、branch `codex/definition-education-review-bundle`。PR/commitは本報告を含むPRのheadを参照。今回のゴールは、人間レビューへ渡す3件の教育設計・課題・評価・進行・表示の点検と必要最小限の修正計画をまとめること。

## 結論

3Definition/2Missionと既存Goal・Plan・Router・Assessment・Guided Practiceを再利用できる。新しい教材Registry/Provider/評価Engineは不要。ただし、技術的に別Stepとして成立することと、受講者に違いが伝わることは別である。

**最大の教育上のGapは構造→背景で同じ課題・目標が再表示されること。** 対象Skillは別だがRubric/評価対象Skill集合も共通であり、背景だけの独立テストではない。現コードを誤って「別の個別課題ができた」と承認しない。

Codexは3件の教育適合を自動承認しない。判断材料は既存[人間レビュー票](PERSONAL_LEARNING_PRODUCTION_DEFINITION_REVIEW_SHEET.md)へ統合した。人間判断は全UNKNOWN、本番APPROVE・STARTは未実施。Wave 0全体も既存の準備不足でNO-GO。追加の復元履歴探索は今回の前提にしない。

## コードと表の照合

| 対象        | 関数/モデル/正本                                                                                                                                | 確認結果                                                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definition  | capability-training `learning-definition-fixtures.ts`: `fixture` / `AI_TRAINING_LEARNING_DEFINITION_FIXTURES`                                   | 3件のみ、Objective/mistakesは既存Mission継承。practicePattern/concepts/prerequisite/targetSkillは別。版はAI_TRAINING_DEFINITION_FIXTURE_V1                        |
| 課題/Rubric | capability-training `mission-quality.ts`: `getAiTrainingMissionQuality`                                                                         | PROMPT_BASIC / PROMPT_CONDITION、定性的条件/成功基準。今回新規本文・版変更なし                                                                                    |
| 表示        | capability-training `runtime.ts`: `renderAiTrainingAction`、database `personal-learning-router.ts`: `PrismaPersonalLearningRouterBridge.bridge` | legacy Missionの固定displayを生成。DefinitionはsnapshotのpersonalLearning参照へ残るが、practicePattern/conceptsを本文へ投影しない                                 |
| Pilot UI    | web `personal-learning-pilot-card.tsx`: `PersonalLearningPilotCard`、`ai-training-mission-card.tsx`: `AiTrainingMissionCard`                    | Plan名は3つで異なる。Mission見出し/目標/課題はlegacy display。支援ガイドはsupportLevel別だがDefinition別ではない                                                  |
| 評価入力    | web `openai-training-answer-evaluator.ts`: `OpenAiTrainingAnswerEvaluator.evaluate`                                                             | Mission/displayの目標・課題・条件・成功基準・Rubricと本人回答を送る。mission.skillKeysで評価、回答内命令に従わないsystem指示。今回実API不使用                     |
| 合否        | capability-training `skill-evaluation.ts`: `finalizeTrainingSkillEvaluation`                                                                    | understanding>=60かつ評価対象Skill全部>=60。Rule AI_TRAINING_SKILL_RULES_V1、Prompt ai-training-evaluation-v3                                                     |
| 次Step      | capability-training `learning-router.ts`: `routeAiTrainingLearning`、database Bridge                                                            | Definition別の独立Assignment/回答/評価証跡を要求。未評価/版不一致はUNKNOWN。REVIEW/SKIPPEDでunderstanding<60ならRETRY、以上ならREVIEW。Plan完了≠Goal達成/契約終了 |
| 実践完了    | capability-training `guided-practice.ts`: `definePracticeCompletion`、database `guided-practice.ts`                                             | START、本人操作申告、本人確認、READY/PASS/監査/Skill照合。outcomeQuality/capabilityLevelはUNKNOWNのまま。Hint/Helpで支援量を補正                                  |
| 承認        | database `learning-definition-approval-admin.ts`、web `http/learning-definition-approval-admin.ts`                                              | 同Service現管理者・準備authority・停止状態、digest/revision/明示確認/7項目checklist。本人教育判断をコードの存在で代用しない                                       |

package公開入口は各index.ts / package.json exportsを確認。UI/Provider/DBからの既存呼出経路を読むのみで、CoreへAI用語やProvider依存を追加していない。任意顧客データ・回答を取得していない。

## 判断が必要なGapと最小修正案（今回未実装）

| Gap                                              | Wave 0での扱い                                                                                                 | 推奨する最小対応 / 受入条件                                                                                                                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 構造と背景の違いが課題内に出ない                 | 人間が「背景に焦点を当てた反復」として妥当か判断。自己完結UXを確認するなら事前修正。全員に別課題だと案内しない | 1つの小PRでPilot限定のDefinition別見出し/今回の焦点/安全な練習案内を決定的Mappingで表示。serverで検証済みkey/version以外は表示しない。Mission/Rubric/既存V1は変えない。3Stepの別焦点、同課題再利用、未知版fail-closed、スマホ表示をテスト |
| 初回から構造・背景の両Skillを要求                | 安全性のための全Skill thresholdを下げない。初心者に厳しいか人間レビュー                                        | 現評価範囲を説明する。背景だけの採点へ変える場合は別のDefinition/Rubric/Rule版設計・回帰・再承認が必要。現versionを書換えない                                                                                                             |
| 課題PASSで進級できるが実践完了は任意             | First Successなしで進級できる事実を観測。運営が本人完了の記録順序を案内。実践必須かは人間判断                  | まず既存完了欄への分かりやすい案内を上記Pilot表示PRに含める案。Routerに新しい実践必須Gateを暗黙追加しない。必要なら独立Rule変更としてレビュー                                                                                             |
| 仕事を思い浮かべる既存instructionsと架空題材推奨 | Wave 0では架空題材で実施。実機密を入力しない                                                                   | 上記Pilot表示PRで「架空・非機密で可」を近接表示。旧Mission本文を全サービス一括変更しない                                                                                                                                                  |
| 60点の教育的妥当性とモデルの誤合格率             | 実モデル品質は未検証。Wave 0は監督下で評価理由を確認する限定試験                                               | 実API試験は別費用承認。EVO-01評価fixtureと比較レポートを再利用。テストPASSを実モデル品質/本人能力の保証としない                                                                                                                           |
| Capability再現性                                 | 3Stepの課題評価/申告だけで自力再現・Transferを認定しない                                                       | EVO-05題材レビュー/履歴投影の後続Gateへ残す。今回まとめてRuntime接続しない                                                                                                                                                                |

上記最小表示PRは提案であり、本PRのmergeだけを実装承認にしない。安全設定・予算・内部人数・公開releaseの整理も並行準備可能だが、本番操作は別承認。新しいDefinition、自由Teaching、Discovery、Level Engineを追加しない。

## 人間が次に行う1判断

既存レビュー票で、**CONTEXT_SETTINGを、背景に焦点を当てた同一課題の反復として内部Wave 0でレビューするか、先にPilot表示を補うか**を決める。その判断を踏まえ3件を個別にAPPROVE / REJECT / REVISION REQUIREDへ記入する。1件だけ決まっても3段階Planの承認が完了したことにはしない。

資料上のAPPROVEとProduction LearningDefinitionApproval保存は別。別操作承認後、`GET /api/services/{serviceSlug}/ai-training/definition-approvals`で現release/固定参照/digest/revisionを再取得し、同Serviceの現ACTIVE SERVICE_OWNER/ADMINが1件ずつ明示確認する。準備authority・feature flag・Pilot停止条件は既存契約のまま。Codexはchecklist自動true、本番APPROVE/DEPRECATE、Participant準備、STARTを行わない。

## 検証記録と未検証

ローカル既存テスト結果:

- `pnpm --filter @bunshin/capability-training test`: 29 file / 465件PASS。Scope/Profile/Goal/Definition/Router/Guided Practice等を含む既存Package全体。
- `pnpm --filter web test -- personal-learning-pilot-ui.test.tsx personal-learning-pilot-http.test.ts openai-training-answer-evaluator.test.ts ai-training-skill-evaluation-boundary.test.ts learning-definition-approval-admin.test.ts`: 5 file / 50件PASS。
- `pnpm --filter @bunshin/database test -- learning-definition-approval-admin.test.ts`: 1 file / 3件PASS。純粋な管理command validation、実DB接続なし。
- 変更Markdown3件のPrettier確認と`git diff --check`。コード変更なしのため全体typecheck/lint/buildは未実施。

合計518件は既存回帰の確認。Providerテストは注入したmock fetch、Pilot UIはcomponent/HTTPテストであり、実認証・実スマホ・本番E2Eではない。DB統合・実Provider品質・実践した本人の理解・本番配備は未確認。Viteの将来configLoader互換に関するwarningがあったがテストは成功し、無関係な設定修正は行っていない。

変更はレビュー票、本報告、Launch Runbook参照のみ。コード/schema/Migration/Provider/課金/LINE/V1/本番設定の変更なし。本番接続・送信・課金・承認・登録・START/STOP・Deployなし。rollbackは文書PRのrevertのみで、DBの承認状態を変更したとは扱わない。
