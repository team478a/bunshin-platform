# マナベルスタイル 実運用判定

基準・本番SHAは[統合監査](INTEGRATED_READINESS_AUDIT.md)。**既存3Definitionの内部Wave 0はCONDITIONAL GO、広いテーマと再現性保証を伴う一般提供はNO-GO**。これはPilot開始の許可ではない。

## 利用フローと接続状況

| 段階                 | 現行実装 / 根拠                                                                                                              | 利用できる範囲 / 未検証                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 受講者登録・初期設定 | `/s/[serviceSlug]/programs/[programEnrollmentId]`、Profile Preparation Card、内部準備UI、`resolvePersonalLearningPilot`      | serverでMembership/Enrollment/Program/Seat/期間を照合。本人INTERNALのSERVICE_OWNER権限と学習権を別確認。初めての受講者が自力で設定できるかはUNKNOWN |
| 学習希望→Goal候補    | `consultAiTrainingLearning`、`learning-scope.ts`、Pilot HTTP `CONSULT`                                                       | 決定的Mapping、必要時だけ経験質問、UNKNOWN≠NONE。CONTENT_REQUESTは本人が自分で行う学習への変換確認、CONSULTINGはGoalにしない                        |
| Goal確認・保存       | `personal-learning-pilot.ts` `CONFIRM_GOAL`、DB `PrismaPersonalLearningPilotRepository` / `personal-learning-persistence.ts` | scope・候補・版をserver再検証。本人選択、ProgramMemberGoal正本、Primary Goal/CAS/idempotency。相談全文は保存しない                                  |
| Plan生成・確認・復元 | Pilot HTTP `PREPARE_PLAN` / `CONFIRM_PLAN`、Application `definePersonalLearningPlan`                                         | 承認済みDefinitionのGoal Mapping、版固定/Revision。DRAFT≠CONFIRMED。ログアウト後の保存状態からの復元経路あり、実本番復元は未検証                    |
| 次の課題             | `routeAiTrainingLearning`、`PrismaPersonalLearningRouterBridge`                                                              | PROMPT_STRUCTURE→CONTEXT_SETTING→CONSTRAINT_SETTINGのみ。PROMPT_BASIC/PROMPT_CONDITIONへの既存Mission Bridge。全テーマ個別生成ではない              |
| 本人の実践           | `guided-practice.ts`、`PrismaGuidedPracticeRepository`、Pilot Card                                                           | INTERACT/Support/本人確認/有用性/Assessment Evidence。AI成果物の代行生成・顧客環境変更なし。外部Tool操作を直接計測していない                        |
| 回答・AI評価         | 既存Answer API/Job、`OpenAiTrainingAnswerEvaluator`、`finalizeTrainingSkillEvaluation`                                       | prompt/回答の評価と本人の成果物品質・能力を区別。queued/PENDINGはGETで再取得、評価完了前に次へ進めない。実Provider完走は未検証                      |
| 次の学習・つまずき   | Router: NEXT / REVIEW / RETRY / BLOCKED / UNKNOWN / PLAN_COMPLETED                                                           | Answer READY＋対応Audit＋Rule/Skill/時刻/版を要求。評価/Skill欠損・不一致はUNKNOWN、未承認/前提不足はBLOCKED。Plan完了でGoal達成/契約終了にしない   |
| 学習成果             | First Success / Capability Evidence / Fit Feedback                                                                           | 本人確認・操作申告と検証済みAssessmentの組合せ。自己申告だけでLevel1〜5を確定しない。実務効果・本人再現・応用は別Evidence                           |

主要Pilot HTTP/access/Seat/Admission/Router/Guided Practiceファイルはproductionとmainのtree差分なし。コード配備済みと、実設定・DB・承認・Seatが成立して実利用できることは別。

## 個別化の実態

Goal/経験/学習履歴に応じた質問・Definition選択・復習/再挑戦は利用可能な実装。次に学ぶものを変える個別化であり、仕事別の教材/例/課題本文を自由生成するTeaching Personalizationではない。現行3Definitionと既存Mission本文を利用する。画像・動画・Excel・API・自動化・AI AgentはDefinition Gapの表示を維持する。

職種/AIレベル/学習時間等の既存Profileは再利用可能。ただし職種を保存していることだけで、課題が本人の仕事へ適合したと判定しない。過去回答全文を無制限に次のLLMや共通Memoryへ送らない。

## EVO05: コード / Runtime / UI / 本番を分離

| PR                      | コード完成範囲                                        | Runtime / UI / 本番                                                                 |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| #1193 EVO05-A           | 2回の明示Evidenceを比較する純粋契約                   | DB/UI/自動課題提示なし。合成入力以外の本人再現は未測定                              |
| #1194                   | 履歴Bridge/Privacy/段階設計                           | 設計文書。実装完了として数えない                                                    |
| #1195 R0                | 限定INTERNAL SERVICE_OWNER本人のExport/削除互換       | 学習権の一般拡張なし。production未配備、実操作未検証                                |
| #1196 R1                | 3Definition×3題材の版付きDraft参照・strict validation | DRAFT/NOT_REVIEWED。参照ResolverはHuman Review Required / UNKNOWN。Approved扱いなし |
| #1197 R2                | 本人scopeの2Assignment履歴読取・比較投影              | 既存題材参照がない履歴はUNKNOWN。新再実践の提示/保存や本人HTTP/UIなし               |
| #1198 review contract   | 版/digest/人間レビューassertion                       | 認証・学習利用権を付与しない                                                        |
| #1199 review repository | 停止中Program、管理権限、lock/CAS、追加監査履歴       | 人間の実レビュー未実施。Approved課題Runtime reader・R3/R4未接続。新schemaなし       |
| #1200（OPEN）           | 管理HTTP接続候補、CI成功                              | main対象外。マージ後も再実践Bridge/本人UIが自動完成するわけではない                 |

EVO05の全部を合成テスト成功から「受講者の再現性評価を提供済み」と表示しない。成果物本文をCore/Telemetryへ保存せず、実務利用・支援量・自己再現Evidenceを分ける。再現性機能未接続はP1の成果確認Gapであり、基本Prompt学習のWave 0を必要以上に延期する理由にしない。

## LINE・スマートフォン

- 会員LINE導線は `/s/manaberu-style/line` からProgram一覧→本人Enrollment→既存学習Webへ接続する実装。会員照合と学習通知は別。
- `service-line-broadcast-eligibility.ts` は既存AI_TRAINING_ACTION通知からPilot Program / PERSONAL_LEARNING_PLAN Assignmentを除外する。既存30日研修のLINE schedulerがPersonal Learning通知として動くとは扱わない。
- Pilot専用の学習通知配信は未接続。これはWeb限定Wave 0の必須ではないが、LINE学習通知を約束する提供条件なら開始前対応が必要。
- スマホ向けCard/縦Plan/CTA、再ログイン・polling・二重送信の実装/合成テストあり。実LIFF、Cookie、端末操作、入力・戻る・評価待ちの本番E2Eは今回未実施。

## 利用開始前の条件

実設定のPilot flag/Production flag、対象Program、Seat/Allowlist/internal cap、3Definitionの正確な版とHuman Approval、Profile、Providerモデル/Admission・出力/日次/同時数、DB/RLS/復旧/ログの証拠を取得する。本監査では現在値はUNKNOWN。人間承認後、内部1〜2人で相談→確認→実践→評価→次課題→First Success→ログアウト/復元→STOPを別途検証する。

開始条件が満たせない場合は開始不可。実学習を行う時点で初めてProvider課金を伴うため、合成テスト実行の承認と混同しない。100人上限は安全制約であり、100人規模の品質・負荷の証明ではない。
