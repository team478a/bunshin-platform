# EVO-05-B 本人再現Evidenceと学習履歴の接続設計

## 状態・基準

- 2026-10-09、基準main `6aaae80688ae2badce181ec7e6a20c2edfdb5f08`（#1193 merge）。
- branch: `codex/ai-evolution-evo05-reproduction-bridge-design`。
- 状態: **PROPOSED / 文書のみ**。接続コード、保存、UI、課題追加、本番操作の承認ではない。
- 前段: [EVO05A_IMPLEMENTATION.md](EVO05A_IMPLEMENTATION.md)、[接続判断ADR](EVO05B_DESIGN_DECISION.md)。
- 目的: 本人が別題材・別時点で再実践した構造化Evidenceを、既存の認可済み履歴から比較できるようにする。成果物品質・自力習得・Level・転移は自動認定しない。

## 1. 現状監査と接続Gap

| 項目           | 実コードの根拠                                                                                       | 現状 / Gap                                                                                                             | 判断                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 比較契約       | `packages/capability-training/src/learning-reproduction-evidence.ts` / `compareLearningReproduction` | 2attempt、版/Scope/時刻、支援比較、UNKNOWNを扱う。Runtime未接続                                                        | 再利用                                                                        |
| 実践履歴       | `packages/database/src/guided-practice.ts` / `recordPractice`                                        | START / INTERACT / COMPLETEをappend。完了metadataにGoal/Plan/Definition/Assignment/Answer参照と支援量。題材キーはない  | 新規履歴のみ最小拡張候補。旧本文から推測しない                                |
| 評価の独立照合 | 同`recordPractice`、`personal-learning-router.ts` / `bridge`                                         | READY Answer、ANSWER_EVALUATED監査、評価時刻・値・Rule、対象Skillを照合                                                | 同じ要件を新投影でも照合。metadataのPASS/verifiedだけを信用しない             |
| 次Assignment   | `personal-learning-router.ts` / `bridge`                                                             | 3DefinitionのPlan経路。PLAN_COMPLETEDで新Assignmentなし。未完Assignmentを上書きしない                                  | 再現用別時点課題を勝手に通常Routerへ追加しない                                |
| 認可・競合     | `personal-learning-persistence.ts` / `authorized`、`personal-learning-pilot.ts` / `requirePilot`     | Serializable、Enrollment lock、所属/本人/期間/Program、Seat、Pilot、ALL削除を検証                                      | 全writeに再利用。比較契約のScope一致は認可代替ではない                        |
| 回答単位削除   | `training-personal-data-deletion.ts` / `snapshot` / `delete`                                         | Answerと、そのAnswerをsourceとするEventを削除。STARTはPlan sourceで残り得る                                            | 比較結果を保存せず、片側完了Event/Answer欠損ならUNKNOWN                       |
| First Success  | `guided-practice.ts` / `recordPractice`                                                              | Enrollment内1回。削除監査があれば新規First Successを抑止                                                               | 新再現機能から再付与しない                                                    |
| 全削除         | `training-personal-data-deletion.ts`                                                                 | Assignment等を削除、Seat取消/allowlist除去、監査を残す                                                                 | 再現用の別正本を作らず、削除後再書込不可                                      |
| 本人Export     | `training-personal-data-export.ts` / `read`                                                          | Eventはtype/Assignment/時刻のみ、Assignmentは一部fieldのみ。新題材/支援/比較根拠は現projectionにない                   | bounded Evidenceの本人Export拡張が必要。metadata全体を公開しない              |
| 所有者本人     | 同Exportの`read`、削除の`owned`                                                                      | 両方`serviceRole: PARTICIPANT`に限定。一方学習認可は限定INTERNAL Seat付きSERVICE_OWNERも利用可能                       | 所有者本人の新Evidence利用開始前BLOCKER。役割を降格/二重所属にして回避しない  |
| 保持           | `personal-data-retention.ts`、`training-retention-snapshot.ts`、`training-retention-execution.ts`    | Answer90日cutoff、終了後90日work redaction/1年progress purge。Answer source Event削除、snapshot/metadata redactionあり | 既存規則を変更しない。新参照も消去/失効試験が必要。自動運用の本番保証は未確認 |

コード存在・unit検証・本番反映を区別する。本番DB、実課題、実ユーザー、実Providerは今回確認しない。旧監査のWeb-only/Hard Cap未実装等の記載を現在の制約へ巻き戻さない。

## 2. 最小接続の段階

1. 認可・Export/削除の境界を確認し、必要な補完を別PRで先行する。
2. 固定合成題材のレビュー資料と最小参照契約を追加する（まだ学習実行へ接続しない）。
3. 既存履歴からの**読み取り専用**投影を追加する。題材が未記録ならUNKNOWNを返す。
4. 人間レビュー後、明示的な本人再挑戦と題材参照の保存を既存Assignmentへ接続する。
5. 最後に本人向け最小UIを別PRで接続する。一般公開/本番Pilot enableは別判断。

前段の成功やPRマージを後段の着手・本番承認としない。保存不足を理由に先行schemaを作らない。

## 3. 題材の正本と版

AI Package側のcode-defined、Human Reviewedな合成課題参照を提案する。3Definitionの意味/承認版は不変。題材はTeaching生成、完成品納品、新Learning Definitionではない。

最小候補は`subjectKey`（EVO-05-Aの固定3カテゴリ）、`subjectVersion`、`challengeKey`、`challengeVersion`、対応Definition参照、既存Mission/quality版参照。課題本文と採用可否はPackage側、人間レビュー資料で管理し、Plan/Eventへ本文をコピーしない。これは未実装・未承認。

- baselineもfollow-upも**提示時に**serverが版固定した題材参照を持つ。相談/Answer本文から後付け分類しない。
- 同カテゴリ内の題材差や同じMissionの2回目だけでは、現在契約の異題材条件を満たさない。
- 異カテゴリでも課題難易度や意味的転移の同等性は未検証。結果は「本人申告＋Prompt評価のEvidenceあり」だけ。
- 現`compareLearningReproduction`は`subjectKey`だけで題材版を持たない。接続Adapterでchallenge/subject版を検証してから呼ぶ案を基本とする。保持・Exportも版参照を含む。必要なDomain拡張は別PRで検証し、同版の意味を上書きしない。
- 旧Assignmentの題材はUNKNOWN。Backfillなし。旧受講者/旧V1を再現課題へ自動変換しない。

## 4. 将来のAssignment Bridge案

既存`ProgramMissionAssignment` / `TrainingMissionAnswer`を実行正本に維持する。新PersonalLearningAssignment/Progress/Memoryは作らない。

将来のsnapshot候補は`personalLearning`の既存Plan/Definition参照に、boundedな`practicePurpose`、`pairKey`、`stage: BASELINE | FOLLOW_UP`と題材版参照を追加する。名前とschemaVersionは実装PRで固定する。クライアントはsubject/Goal/Plan/Evidence/verifiedを自由指定しない。

- 再現開始は本人の明示操作。通常RouterのNEXT/Plan完了、Goal達成、Enrollment終了とは別。まず対応3Definitionと現在CONFIRMED Planに限定する。
- baselineが将来の版付き題材で提示・完了した後だけ、後時点のfollow-upを提示できる。後時点＝別login/sessionを自動意味しない。最小間隔や学習効果を捏造しない。
- 新提示時に本人/Service/Workspace/Group/Enrollment/Membership、Seat/Pilot/利用期間、ACTIVE唯一Goal、現在Plan revision、Definition APPROVED、Mission/quality対応を再検証する。旧revisionの提示要求は拒否する。
- 未完Assignmentがあれば新規提示を拒否する。ProgressのcurrentAssignmentを既存CAS/lock内で接続し、通常Routerが別課題を重ねて提示しないことを検証する。
- 現RouterはPlan内の同Definition履歴を評価するため、再現課題を通常completion/review/planCompleted集計へ混ぜると影響する。purposeを判別できない旧履歴は従来動作のまま。新purposeの明示除外/別投影は独立レビューが必要。Provider/Execution Gateは迂回しない。
- Assessmentは既存Prompt評価を利用する。再現性をLLMが自動認定する新Providerは作らない。非実行テストで再認可・Admission・上限を回帰する。

## 5. idempotency・同時実行

候補operationはactor、Scope、現在Plan revision、pair、stage、固定challenge版をserverで照合する。同じ操作キー・同じ内容の再送は同Assignmentを返し、異内容はCONFLICT。新UUIDで同じstageを重ねても二重作成しない。

Enrollment lockとSerializableを使い、pair/stageの既存Assignment/Event確認→新Assignment/receipt→Progressを同Transactionへ入れる案。現`ProgramActionEvent`のworkspace/group/idempotency一意制約を再利用できるか実装時に隔離DB競合試験する。巨大Quotaや新台帳を先行しない。必要なDB制約が見つかった場合のみ理由とadditive migrationを別レビューする。

通常Router/回答/削除/停止との競合も同時試験対象。再送時も認可・取消・最新revisionを先に確認し、失効後に旧receiptを返して再開させない。

## 6. 信頼できる履歴投影

新Repositoryは本人に限定し、次を**一つの整合したsnapshot**で確認する。取得上限・打切りはUNKNOWN、日時近接や最高scoreから自動的にpairを選ばない。

1. pairの2件が同一Scope/Goal/Plan revision/Definition版、別Assignmentであること。
2. snapshotの題材/課題版をPackage側のHuman Reviewed定義へ照合すること。旧/未知/redactedはUNKNOWN。
3. 各完了Eventが同本人/Assignment/版を持ち、STARTと必須操作・本人完成確認に一致すること。
4. EventのAnswer参照、READY Answer、同じsourceのANSWER_EVALUATED監査が全Scopeと時刻/値/Ruleに一致すること。対象Skillの評価キー・score、PASSとAssignment COMPLETEDも再確認すること。
5. STARTで選んだ支援量とHINT_VIEWED/HELP_REQUESTEDを`effectivePracticeSupport`で照合すること。完了後の余分な支援記録など時刻矛盾はUNKNOWNとし、記録済み支援量を減らさないこと。
6. 各Assessment時刻≤完了時刻、follow-up評価/完了がbaseline完了より後であること。
7. 削除/期限redaction/評価更新で根拠が欠けた場合は保存済み比較成功を使わず、UNKNOWNに戻すこと。

比較結果は非永続projectionを第一案とする。2つのAnswer IDを1つの新成功Eventへ複製しない（片側削除の取り残しを防ぐ）。完了Eventは自身のAnswerだけを`TRAINING_MISSION_ANSWER` sourceとして持ち、本文なし。新pair Eventへ評価値をコピーしない。

`EVIDENCE_AVAILABLE`は学習成果保証ではない。支援比較、本人申告、Prompt評価の由来、未測定を分け、外部操作/品質/Level/Transfer UNKNOWNを保持する。

## 7. 保持・削除・Export・停止

| 操作 / 事象           | 接続の受入条件                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ANSWER削除            | 該当評価/COMPLETE/First Successの既存source削除を維持。片側が消えれば比較UNKNOWN。反対側へ削除されたAnswerの参照を複製しない                                   |
| ALL削除               | Assignment/参照/関連Event/Plan/Goalの既存削除・cascadeを検証。Seat枠は保持するがアクセスは取消。遅延writeを拒否                                                |
| 90日Answer保持        | Answer source Eventが消えた後UNKNOWN。独立した永久成功ledgerを作らない                                                                                         |
| 終了後redaction/purge | snapshotやmetadata消去後に課題版を復元しない。現行終了日時不明はUNKNOWN。30日期限を新設しない                                                                  |
| 本人Export            | bounded題材版、支援、完了/評価参照とUNKNOWN理由の明示投影。metadata丸ごとや他人/管理用情報は出さない。本人向け既存Answer exportとTelemetry本文禁止を混同しない |
| SERVICE_OWNER本人     | 限定INTERNAL Seatの学習権と、本人Export/削除の安全な権限境界を別に設計・検証。管理権限だけで他人のデータ操作を許可しない                                       |
| Pilot STOP / Seat取消 | 新提示・write・Provider新規実行を止める。保存済みデータを削除しない。データアクセス権は本人privacy契約で別判定                                                 |
| Backup / Provider     | 完全消去や復元後再削除をコードだけで保証しない。運用証跡はUNKNOWN                                                                                              |

既存保持期間を今回改定しない。新題材参照/構造化Eventが既存規則に含まれること、purge/退会/復元後再削除の対象漏れがないことを実装開始前に人間レビューする。本番のretention実行状況は未確認。

Privacy操作へ実行Gateをそのまま流用しない。Pilot停止・Seat取消・Program停止後も、本人の過去データExport/削除権を現在の利用権とは分けて検討する。所有者本人の限定INTERNAL参加履歴と本人Enrollment/Membershipを認証済みserverで照合する案とし、現時点の有効Seatだけを必須にして取消後の削除を塞がない。ALL削除後はSeatのEnrollment参照がnullになり得るため、再送/本人証明の条件も専用回帰が必要。具体的な失効/退会時の認証・Privacy権限はR0レビューで確定し、今回新権限を実装しない。

## 8. PR分割と受入試験

| 候補                | 最小範囲                                                                          | 必須試験 / Gate                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| R0 Privacy互換      | 本人INTERNAL SERVICE_OWNERのExport/削除境界を限定補完（必要なら）。新題材保存なし | 自身INTERNALのみ、他User/Service拒否、ALL/ANSWER、停止時の本人privacy権、削除/評価競合、V1互換                                |
| R1 題材参照契約     | 固定合成challengeレビュー資料、版付き参照・strict validation。まだDB/UI未接続     | 3Definition/既存Mission対応、本文禁止、未知版、human review、旧履歴UNKNOWN                                                    |
| R2 履歴投影         | 認可済み読取Port/Repository→EVO-05-A。成功保存なし、課題生成なし                  | 偽PASS/監査欠損、Skill不足、Scope、支援、時刻、片側削除、打切り、OWNER privacy Gate                                           |
| R3 明示再実践Bridge | 既存Assignmentへの題材保存・別時点提示と通常Routerとの分離                        | 同時2要求/再送/新UUID重複、未完拒否、Plan変更、Approval取消、STOP/Seat取消、Provider前認可、delete競合、First Success重複なし |
| R4 本人最小UI       | 題材/再実践確認、自己申告限界と支援量、結果UNKNOWN表示                            | 戻る/再ログイン/二重押下、対象外/未対応、旧V1非表示、本文Telemetry禁止。実UI試験は別承認                                      |

R2時点では既存履歴に題材がないため、実履歴の結果はUNKNOWNで正常。合成fixtureだけの成功を本番効果保証にしない。R3/R4まで自動的に進めない。ハッシー同母数比較とEVO-06は本設計の対象外。

## 9. 人間レビュー事項・開始判断

- **BLOCKER**: 所有者本人の新機能利用前のExport/削除経路整合。
- **REQUIRED**: 固定課題と版/レビュー正本、通常Routerとのpurpose分離、本人明示再挑戦、現在の利用期間/認可/Approval/Gate維持。
- **REQUIRED**: 新参照の保持/削除/Export、削除競合・再書込不可を受入試験で確認。
- **UNKNOWN**: 本番反映、実ユーザーの再現性、Provider実測、retention定期実行、backup完全消去、課題間同等性。

推奨する次の最小作業は**R0の限定Privacy互換補完**。管理者全体への権限拡張や新保存を行わず、本人INTERNAL Seat付きSERVICE_OWNERの既存データ操作条件と回帰をレビューする。

現時点: 設計レビュー提出可能。再現機能の本番利用開始は**NO-GO**。今回コード/DB/schema/migration/UI/モデル/Provider/LINE/OEM/本番設定を変更しない。rollbackは文書PRのrevertのみ。

## 10. 検証記録

根拠は本書の関数/ファイルと既存テスト。`training-personal-data-deletion.test.ts`は削除・CAS・再送・越境・上限をfakeで検証。`personal-learning-persistence.integration-cases.ts`にはAnswer削除で完了/First Successが消える隔離DBケースがある。これを新pairの削除まで確認済みとは扱わない。

今回のローカル検証:

- capability-training全体: 26 files / 325 tests成功（EVO-05-Aの37 testsを含む）。
- databaseの削除/Export/削除後生成回帰: 3 files / 11 tests成功。fake Repositoryでの検証であり、今回実DBへ接続していない。
- architecture:check成功、`git diff --check`成功。
- 全体formatとPR CI最終結果はPR検証追記を参照。コード変更なしのため、全体typecheck/lint/buildと隔離DB integrationは既存CIで確認する。

新しい接続挙動のテストは未実装。合成テストのみ、Production接続・実課金APIなし。本書レビュー後に停止し、次の指示を待つ。
