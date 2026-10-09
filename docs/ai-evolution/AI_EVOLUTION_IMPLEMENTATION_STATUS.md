# AI進化対応 EVO-01〜05 実装・未完了状況

基準main/本番・PR/CI・検証範囲は[統合監査](INTEGRATED_READINESS_AUDIT.md)。#1189〜#1199はMERGEDかつverify/database SUCCESSだが、現在productionには未配備。コードの完成と本番の効果を分ける。

## 完成した範囲と残る範囲

| EVO / PR                                                                                                                                        | 完成した範囲・再利用                                                                                                                                                                                                                                           | 未完了 / 実用上の限界                                                                                                                                                                              | 判定                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [01 #1189](https://github.com/team478a/bunshin-platform/pull/1189) 品質比較                                                                     | `apps/web/test/ai-evolution/{dataset,evaluator,report}.ts`、Daily7/Weekly7/Assessment10の24合成ケース。実Adapter/Validator/Rubricをfake fetchで呼ぶ。Commit/sourceDigest/モデルlabel/Prompt/Rule/Dataset/日時/失敗/未測定/人間レビュー、追加保存・条件一致比較 | 実API比較runner・実品質/費用/時間・人間の候補採用は未実施。異なる版/digest/caseはINCOMPARABLE。外部呼出し0、releaseVerdict UNKNOWN固定                                                             | オフライン基盤は実装済み・合成確認済み。本番品質保証ではない |
| [02 #1190](https://github.com/team478a/bunshin-platform/pull/1190) 通信安全                                                                     | Weekly/Strategyが`mission-provider-response.ts`を再利用。55秒Abort、safe HTTP/error code、invalid JSON/未完出力拒否、失敗usage。既存Jobのretry/backoff/冪等                                                                                                    | 全Adapter共通Gatewayでない。Adapter単体は1fetch、再試行は既存Job責務。送信済みProvider処理/課金の取消保証なし。Retry-After/jitter未実装。実障害は未検証                                            | 対象2経路は実装済み・合成確認済み                            |
| [03 #1191](https://github.com/team478a/bunshin-platform/pull/1191) モデル互換                                                                   | `openai-task-compatibility.ts` の `OPENAI_TASK_COMPATIBILITY_V1`、SOCIAL_PLANNER(Daily/Weekly) / TRAINING_ASSESSMENT。Responses/text/strict JSON/store:false、schema/option限定。未知model/optionはCONFIGURATION_ERROR                                         | gpt-5.2 / 2025-12-11、gpt-5-mini / 2025-08-07のexact allowlist。これは品質/予算/アクセス承認でない。Strategy/Content/vision/他taskまで制御しない。独立task別Model Routerなし                       | 限定互換Gateは実装済み・合成確認済み                         |
| [04 #1192](https://github.com/team478a/bunshin-platform/pull/1192) 原価照合                                                                     | Application `reconcileAiCosts` / `AI_COST_RECONCILIATION_V1`。AiUsageEventとPERSONAL_LEARNING_AI_CALLをexact usageKey/scopeで照合、同attempt二重計上防止、価格snapshot整数計算、欠損UNKNOWN/矛盾CONFLICT、known subtotal分離                                   | 純粋契約で実Reader/管理画面/定期集計未接続。2台帳best-effort保存で両方欠落は検知不能。group/service/OEM直接帰属不足。actualCallCoverage UNKNOWN / RECORDED_ATTEMPTS_ONLY / billingUse NOT_APPROVED | 契約は実装済み・合成確認済み。費用運用は一部実装             |
| [05-A #1193](https://github.com/team478a/bunshin-platform/pull/1193) 本人再現                                                                   | `compareLearningReproduction` がsame scope/Goal/Plan/Definition版・別Assignment/Answer・時刻・検証済み評価/完了を要求、支援量比較                                                                                                                              | external Tool実操作/成果品質/Capability Level/応用はUNKNOWN。新規再実践課題提示・本人UIなし                                                                                                        | 比較契約は実装済み、Runtime機能は未完成                      |
| [05-B #1194](https://github.com/team478a/bunshin-platform/pull/1194)〜[R2 #1197](https://github.com/team478a/bunshin-platform/pull/1197)        | 設計、[R0 #1195](https://github.com/team478a/bunshin-platform/pull/1195)本人Privacy、[R1 #1196](https://github.com/team478a/bunshin-platform/pull/1196)Draft参照、R2 `PrismaLearningReproductionHistoryRepository`本人履歴投影                                 | 旧履歴に題材参照なし→UNKNOWN正常。Draftを勝手にApprovedへ昇格しない。本人用実比較API/UIなし                                                                                                        | 部分実装                                                     |
| [レビュー #1198](https://github.com/team478a/bunshin-platform/pull/1198) / [監査 #1199](https://github.com/team478a/bunshin-platform/pull/1199) | strict review assertion、`PrismaReproductionChallengeReviewAdminRepository`、停止時のみ・権限・lock/CAS・版/digest・immutable audit                                                                                                                            | 実承認未実施、管理session HTTPは#1200未マージ、Approved reader/再実践Bridge/R4UI未接続。NOT_GRANTEDは学習許可でない                                                                                | 管理契約/保存まで部分実装                                    |

EVO01の保存済みbaselineにある観測10 PASS / 13 FAIL / 1 UNKNOWNは、意図的な悪いfixtureも含む結果。期待した違反検出が成功した記録であり、実モデルのエラー率ではない。今回baseline/reportテストも成功。

## 共通基盤の完成と非目標

Provider Adapter / Application Port、認可・Tenant分離、AI usage、Program Runtime、Job/既存quota、Pilot Admissionを再利用する。新しいGateway/Registryを全面実装したわけではない。各Adapterのfetch/default model/usage抽出には重複が残るが、監査で統合・削除しない。

managed Provider設定が存在する場合を優先し、停止/不正設定をlegacy envへfallbackして迂回しない。設定未作成時のみ従来fallback＋対象task互換チェック。Service/OEM/taskごとに自由にmodelを変えられる完成機能とは表示しない。

AiUsageEventはAI呼出し原価、ServiceUsageEvent/RegistrationはOEM請求人数。異なる単位を統合・二重加算しない。価格不明/cached内訳不足を0円にしない。EVO04の未接続を「すでに二重請求が発生」と断定しない。

## 新モデルを採用する最小手順

1. taskと利用範囲を固定。モデルID、API形式、schema/option/出力上限/timeout、価格版、Providerアクセス条件を確認。allowlistへの追加は別レビュー。
2. 現行Commit/Prompt/Rule/Dataset/sourceDigestを固定し、EVO01を実行。必須違反/UNKNOWN/比較不能は採用保留。
3. 候補の通信・schema・互換性をfakeで検証。対象外taskへのglobal設定変更の波及を列挙。
4. 人間が予算・データ取扱い・候補比較を承認してから、合成入力のみの少量実API比較を別作業で実施。現行/候補の同条件、token/latency/error/原価、未測定・人間レビューを追加保存する。今回は実行しない。
5. 実品質・安全・費用の採用基準を満たした後、切戻し対象設定/コードを固定、配備とMigration Gateを分離して承認。限定対象で監視する。
6. 欠損/創作/誤PASS/越境/費用異常なら停止・切戻し。旧結果を上書きせず比較条件を保存する。

現状はこの判断の土台ができた段階。Dots/Codexへのログ受渡しや自動改善・自動PR/merge/deployは今回の完成範囲に含めない。本文を外部へ渡さず、人間承認した匿名構造化の改善候補を将来検討する。
