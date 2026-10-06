# Personal Learning 限定Pilot 開始前Gate / staging運用手順

## 範囲と判定

2026-10-06 JST。基準main: `9dce361ab348f2586f03890aed60fec4a67651e7`（[P1-F #1152](https://github.com/team478a/bunshin-platform/pull/1152)）。文書専用branch: `docs/personal-learning-pilot-readiness`。

目的は1〜5人の非本番Pilot準備。**現時点は開始NO-GO**。mainへのマージはstaging配備、Migration、Definition承認、参加者登録、評価Provider利用、本番公開の承認ではない。本書の手順は未実行。新機能、コード、DB、環境設定は変更しない。

正本:

- [P1-F実装報告](AI_TRAINING_PERSONAL_LEARNING_P1F_PILOT_UI_IMPLEMENTATION.md)、[composition ADR](ADR_P1F_PERSONAL_LEARNING_PILOT.md)
- [P1-C-S Release Runbook](AI_TRAINING_PERSONAL_LEARNING_P1CS_RELEASE_RUNBOOK.md)、[Deployment Guide](../DEPLOYMENT_GUIDE.md)、[Backup / Restore](../BACKUP_RESTORE_RUNBOOK.md)
- [固定Definition](../../packages/capability-training/src/learning-definition-fixtures.ts)、[Completion Rule](../../packages/capability-training/src/learning-router.ts)
- [Pilot設定判定](../../packages/capability-training/src/personal-learning-pilot.ts)、[Web環境・本人認可](../../apps/web/src/services/personal-learning-pilot-access.ts)
- [保存・承認読取](../../packages/database/src/personal-learning-persistence.ts)、[Pilot Repository](../../packages/database/src/personal-learning-pilot.ts)

## 調査証跡と未確認事項

| 項目                            | 確認した事実                                                                                                                                                | 判定・限界                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| main                            | #1152 MERGED、merge SHAは上記基準main                                                                                                                       | コード反映済み。配備証拠ではない                 |
| P1-F PR CI                      | 最終head `6fd4a21d0e7fe2aa79b08eb93ff77c43dfb9fdd9` のverify / database成功（[run](https://github.com/team478a/bunshin-platform/actions/runs/37427350591)） | 自動検証済み。実認証staging検証ではない          |
| merge後main CI                  | [run 37428615328](https://github.com/team478a/bunshin-platform/actions/runs/37428615328)は初回確認時実行中                                                  | 採用SHAの最終結果を開始前に再確認                |
| production branch               | `87c5fafcdf9b84c67dd33aef41860368415ca789`                                                                                                                  | 基準mainとは異なる                               |
| GitHub最新Production Deployment | ID `6863375278`、同production SHA、2026-10-05T15:43:24Z作成、status success                                                                                 | 公開aliasの現在SHA・本番DB適用状態は未確認       |
| staging                         | URL / project / DB / 認証 / ownerの証拠なし                                                                                                                 | UNKNOWN。存在しないと断定しない                  |
| 配備設定                        | `apps/web/vercel.json`はproductionだけGit連携を許可                                                                                                         | main / PRマージだけではstagingはできない         |
| 非本番Migration                 | `deploy-migrations-for-vercel.mjs`は`VERCEL_ENV !== production`で適用をskip                                                                                 | `APP_ENV=staging`だけではMigrationは適用されない |
| Pilot開始条件                   | 非本番flag、専用Program、本人allowlist、承認済み3版、実Profileが必要                                                                                        | 対象環境の実データは未確認                       |
| 元checkout                      | 未解決変更を保持。既存managed worktreeから調査                                                                                                              | 上書き・移行なし                                 |

これらは2026-10-06のGitHubメタデータとリポジトリ確認であり、DBや管理画面への接続確認ではない。公開情報と実環境が異なる場合は実環境の証跡を再取得する。秘密値・相談本文・回答本文をPRへ掲載しない。

## Gate一覧

`PASSED`は責任者、確認時刻、対象SHA/環境、証拠がある場合のみ。空欄はUNKNOWN、失敗はBLOCKED。以下はすべて未通過であり、担当者欄は役割候補であって任命済みではない。

| Gate                   | 担当者候補                         | 必須証拠                                                                   | 現在    |
| ---------------------- | ---------------------------------- | -------------------------------------------------------------------------- | ------- |
| G0 対象・費用・Privacy | サービス責任者 / 環境owner         | staging識別子、期間、参加者数、予算上限、保持・削除方針                    | UNKNOWN |
| G1 staging配備         | リリース担当者                     | 採用SHA CI、独立DB/認証/secret、配備方法承認、配備SHA                      | UNKNOWN |
| G2 DB準備              | DB担当者                           | Backup/restore、全pending一覧、互換性、Migration結果、実role/RLS/readiness | UNKNOWN |
| G3 Definition承認      | 教育レビュー担当 + 同Service承認者 | 固定版3件のレビュー、現権限、承認登録・停止手順                            | UNKNOWN |
| G4 参加者・Profile     | サービス運営者                     | 専用Program/Enrollment、本人回答のProfile、旧Goal/Assignment/通知Jobなし   | UNKNOWN |
| G5 限定設定            | 環境owner / 運営者                 | 非本番flag、1〜5件allowlist、通知停止、対象外拒否                          | UNKNOWN |
| G6 実認証検証          | QA / Pilot担当者                   | 下記A〜Jと復元・失敗・Privacyの結果                                        | UNKNOWN |
| G7 Pilot開始           | 人間の開始承認者                   | G0〜G6、実評価承認、停止担当者、Go/No-Go                                   | UNKNOWN |

## G0 / G1 対象環境と配備方法

1. 環境ownerがstaging URL、配備project、DB project識別子、責任者、採用commitを指定する。接続URLやTokenではなく識別子と権限範囲を記録する。
2. productionのDB・session/認証secret・CRON secret・Provider資格情報を流用しない。実ユーザーデータのコピーを前提にしない。stagingのcallback/cookie/origin設定と本人認証を確認する。
3. 現行Git配備はproduction限定。独立staging projectまたは承認済み手動配備経路を選ぶ。**確認目的でmain→production PRや本番redeployを起動しない。** 配備設定を変更する必要があれば独立レビューへ分離する。
4. 本番相当の全release差分、採用SHAのCIを確認する。配備後はDeployment SHAと対象URLの一致を確認する。healthだけでPilot本人認可を検証済みにしない。
5. 評価を行うworker起動方法を確定する。stagingではCronが本番同様に動くと仮定しない。共有workerの手動起動は別機能のJob/外部実行にも影響するため、対象Job、許可範囲、停止方法をレビューする。LINEや実決済Jobを便乗起動しない。

実評価は既存Providerを使う。利用承認では、送信する回答データの範囲、参加者の説明・同意、モデル/費用上限、再試行上限、使用量監査、保持・削除・Exportを確認する。合成評価だけの試験はUI/状態遷移検証であって、実評価の品質検証ではない。

## G2 staging DB準備（別実行承認）

P1-C-S RunbookのBackup、全pending、DDL lock、旧V1互換性、失敗復旧条件をstagingにも適用する。P1-C-Sだけがpendingとは仮定しない。

1. 承認された読み取り経路でDB project、接続role、`_prisma_migrations`のfinished / rolled_back / failed状態、リポジトリとの差分を照合する。
2. Backup/隔離restore、旧Goal index作成の影響、全pending Migrationの互換性・必要な停止/drainをレビューする。失敗Migration、想定外pending、対象DB不明なら停止する。
3. 対象DBと実行者が承認された後にだけ、secureにstagingの接続を設定した専用runnerから既存`pnpm db:migrate:deploy`を実行する。本書作成では実行していない。
4. `pnpm db:assert-ready`、Migration finished、3追加tableのFK/CHECK/RLS、実アプリroleの権限、匿名/一般クライアントの直接アクセス拒否を確認する。superuserのテスト成功だけでは不十分。
5. 適用済みMigration編集、失敗履歴削除、確認なしのmigrate resolve、旧ユーザーbackfillをしない。build失敗時もDBだけ進んだ可能性を調査する。

非本番では`pnpm db:migrate:vercel`がskipするため、これをMigration成功の証拠にしない。`APP_ENV`と`VERCEL_ENV`は別判定である。回避のためstagingを`VERCEL_ENV=production`に偽装しない。

## G3 Definitionの教育レビューと人間承認

全参照はpackage `AI_TRAINING`、version `AI_TRAINING_DEFINITION_FIXTURE_V1`。fixtureという名前だけで否認するのでも、マージ済みだから承認するのでもなく、以下を固定SHAで人間がレビューする。

| Definition         | Skill             | prerequisite                 | 既存Mission      |
| ------------------ | ----------------- | ---------------------------- | ---------------- |
| PROMPT_STRUCTURE   | promptStructure   | なし                         | PROMPT_BASIC     |
| CONTEXT_SETTING    | contextSetting    | PROMPT_STRUCTURE（同固定版） | PROMPT_BASIC     |
| CONSTRAINT_SETTING | constraintSetting | CONTEXT_SETTING（同固定版）  | PROMPT_CONDITION |

Objective、Concepts、Common Mistakes、Practice Pattern、Safety、Rubric/Skill rule version、Completion Ruleも確認する。特に最初の2件が同じMissionを利用するため、Definitionごとの学習・評価が区別できるか、繰り返しに教育上の意味があるかをPilotレビュー項目とする。成果物制作代行・業務相談へ広げない。

承認読取の現行条件は、同Workspace/Serviceの完全一致参照、`APPROVED`、未来でない`approvedAt`、同Serviceで現在ACTIVEな`SERVICE_OWNER / SERVICE_ADMIN`、ACTIVE User。承認者が失効すれば利用できなくなるため開始時と運用中に再確認する。`REVIEWED`やテストの合成APPROVEDは代用不可。

**承認管理API/UIと登録・変更の専用監査手順は未整備。** 本書はSQL INSERTや一括APPROVED seedを提供しない。以下を満たす信頼済み管理操作手順を人間がレビューするか、最小承認管理を独立PRで整えるまでG3は通過不可:

- 実行する人間と承認する人間を識別し、対象環境/Service/参照版/現在の権限を再検証する。
- exact参照、レビュー根拠、approvedAt/by、操作前後、日時、実行者をアクセス制限された監査証拠へ残す。承認表の1行だけをappend-only操作監査と称しない。
- 別Service・版違い・失効権限・未来時刻・二重/競合操作を拒否し、既存承認を無断上書きしない。
- 停止時は新規利用を止め、過去Planの版固定履歴を保持する。承認撤回/DEPRECATEDの操作と再承認の条件もレビューする。

## G4 専用Program / Enrollment / Profile

既存30日V1 Programへmarkerを後付けしない。専用Programを用意し、1〜5人の本人とACTIVE PARTICIPANT所属、同Workspace/ServiceのEnrollmentを照合する。学習用の参加者権限とDefinition承認者の権限を混同しない。

Pilot Programは設定markerが存在するだけで旧Runtimeから予約される。準備中はProgram停止とflag無効を維持する。旧ACTIVE Goal、旧Assignment、通知Jobを持ち込まず、対象者のEnrollment期間を実際の契約/同意と一致させる。期間終了を習得済みにはしない。

Profile正本は既存`TrainingParticipantProfile`。本人が回答した既存必須項目と5軸scopeを検証し、`updatedByUserId`の実行者を確認する。任意情報は不要なら収集しない。未回答を初心者/NONEに捏造せず、相談本文・企業秘密をProfileへ転記しない。Goalは本人確認フローで後から保存する。Goal本文をProfileへ複製しない。

**Pilot用Profile初期化UI/APIはない。旧Profile保存APIは予約Programを拒否する。** markerを外したり、先に旧V1として登録して戻したりして回避しない。本人回答の取得・validation・scope認可・最小保存・監査・再送/競合を扱う管理操作手順を別レビューするか、最小初期化機能を独立PRで整える。DB必須fieldへ架空のdefaultを入れることを手順にしない。

## G5 設定と有効化の順序

1. G0〜G4を満たすまではflagを無効、専用Programを停止して準備する。一般参加者に表示しない。
2. 既存settingsを保持し、専用Programの`moduleKey=AI_TRAINING_V1`、`personalLearningPilot.enabled=true`、`enrollmentIds`に重複なし1〜5個の承認済みEnrollment UUID、`trainingOperations.notificationsEnabled=false` / `postponedReminderEnabled=false`を設定する計画をレビューする。
3. `APP_ENV=staging`、`PERSONAL_LEARNING_PILOT=true`の対象deploymentを確認する。productionではflagがtrueでも拒否する現在のgateを緩めない。
4. 専用ProgramをACTIVEへ変更する対象・実行者・日時を別承認する。allowlist外/設定不正/停止時は旧V1へfallbackしないことを実認証で確認する。
5. 設定前後の証跡と復旧先をアクセス制限して保存する。参加者UUID一覧や資格情報を公開PRへ貼らない。

## G6 実認証の受入チェック

対象URLはstagingの`/s/{serviceSlug}/programs/{programEnrollmentId}`。APIは同Service/Enrollment配下の`personal-learning`。URLを知っていることは権限ではない。実行者、採用SHA、日時、匿名化したテスト識別子、結果、証拠URLを各ケースに記録する。

| Flow | 検証内容                                                                                             | 合格条件                                                             |
| ---- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A    | 学びたいこと不明→Prompt選択→候補→Goal確認→Draft Plan→独立Plan確認→Mission→回答→既存評価→次Definition | 自動確認なし、正しい版/本人scope、次Definitionは検証済みEvidenceのみ |
| B    | 「営業メールを書いて」→学ぶことへ本人同意                                                            | 成果物を生成せず、Suggestionの直接Goal保存なし                       |
| C    | 集客相談、境界回避文言                                                                               | 対象外。業務提案/Goalを勝手に作らない                                |
| D    | 画像/動画/Agent等の未対応テーマ                                                                      | 準備中表示。Definition/Goal/教材の自動生成なし                       |
| E    | REVIEW相当の既存評価                                                                                 | 復習表示と版付きEvidence。テストfixtureはstaging内の明示合成と区別   |
| F    | RETRY相当の既存評価                                                                                  | 再挑戦表示、既存試行履歴保持、PASS捏造なし                           |
| G    | 3Definition完了→再読込                                                                               | Plan完了復元。Goal達成/Enrollment終了/研修修了へ変換しない           |
| H    | 別User/Workspace/Service/EnrollmentへのURL/API差替え                                                 | Goal/Plan/Assignment/Answer非開示、操作拒否                          |
| I    | 同環境の旧30日V1                                                                                     | 元の画面・回答・評価・Goal挙動維持。Pilotへ移行なし                  |
| J    | flag無効、allowlist外、Program停止、承認不明/DEPRECATED                                              | Pilot非表示/拒否、新Assignment/評価受付停止、旧V1 fallbackなし       |

追加確認:

- 既知Profileの再質問なし、UNKNOWNとNONE区別、最大3問。本文をEvent/log/Profileへコピーしない。
- Goal/Plan二段階確認、同じidempotency再送の重複なし、古いrevision CAS拒否、Goal保存後Plan準備失敗から復元。
- Goal確認後、Plan確認後、回答後、評価待ち、Plan完了でログアウト→再ログイン。相談途中は永続化されず再開始できる。
- 回答/評価Jobの待機・失敗・再送、UNKNOWN時の停止。実評価承認なしで評価送信ボタンを押さない。
- flag停止/allowlist失効をJob登録・worker実行・Provider直前で拒否。既にProviderへ送信された呼出しを取り消せるとは主張しない。
- 実スマートフォンで横はみ出し、CTA、戻る/再読込、評価待ちを確認。合成previewの合格を実環境結果へ転記しない。
- FIT / NEUTRAL / NOT_FITの本人・評価済みAssignment限定、再送重複なし。未回答を中立補完しない。
- 既存本人Export/削除の許可範囲・対象・監査を隔離テストデータで確認。実参加者データの削除をsmokeとして実施しない。

REVIEW/RETRYを必ず発生させるため実回答を改ざんしたり、本物のAssessmentへ合成PASSを混ぜたりしない。制御fixtureでの分岐検証と実Provider評価品質を別の証拠にする。

## G7 少人数Pilot運用・停止

開始前に期間/担当者/費用上限を人間が指定する。全Gate通過後も一般公開しない。参加者に「代わりに答えを作るのではなく、自分でAIを使う研修」「未対応テーマがある」「相談途中は保存されない」を案内する。

学習後は既存fit選択を利用し、Goalへの納得、Planの理解、今日やること、評価の理解、自分に合う感覚を短く確認する。任意の聞き取りは別途同意し、相談/成果物の全文をAnalyticsへ取り込まない。

KPIは[P1-F報告のEvidence表](AI_TRAINING_PERSONAL_LEARNING_P1F_PILOT_UI_IMPLEMENTATION.md#analytics--feedback--privacy)を利用し、少数の件数/分母/未回答/観測期間を併記する。自動Dashboard/ブラウザ終了検知はない。最新Eventのないことだけで離脱と断定せず、別Tenantと合算しない。

scope漏れ、未承認Definition利用、通知混入、無承認Provider送信、費用上限超過、旧V1回帰、復元不能があれば停止する。UNKNOWN増加は推測PASSで解決せず原因を調査する。

停止は非本番flag無効、専用Program停止、保留評価Jobの確認を行う。marker/Goal/Plan/Answer履歴を消さない。既に進行中の外部呼出しは別途確認する。コードrevert前に専用ProgramをSUSPENDEDとして旧Runtime誤稼働を防ぐ。復旧はDB互換性・Privacyと保留Jobを再確認し、別人間承認で再開する。table DROP/restoreは本書の停止操作ではない。

## 承認票と次の作業単位

アクセス制限された運用記録へ次を記入する。秘密値、回答本文、相談本文は含めない。

- 環境識別子 / 採用SHA / 配備SHA / 確認日時:
- 環境owner / DB担当 / 教育レビュー担当 / 開始・停止責任者:
- G0〜G6の判定、証拠、残条件:
- Definition3件のexact版 / レビュー根拠 / 承認者・日時 / 登録監査:
- 専用Program / 本人allowlistの管理先 / Profile準備証拠:
- 実評価利用・Privacy・費用上限 / 観測期間:
- Pilot開始 Go / No-Go、承認者・日時:
- 停止/復旧先 / 再開条件:

推奨順序は「stagingの有無・owner確定」→「配備/DB計画承認」→「教育レビュー」→「承認登録とProfile初期化の最小手順または独立PR」→「設定」→「実認証検証」→「限定Pilot」。管理操作を安全に行えない場合は必要な最小機能だけ別指示で実装する。Teaching Personalization / 新Definition / LINE / Memory / Factory / Codexへ先行しない。

本書作成の検証は参照コード・schema・Migration SQL・GitHub metadata・文書format・diffの照合まで。実環境Gateは一件もPASSEDへ変更していない。
