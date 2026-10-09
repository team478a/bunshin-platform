# 隔離復元環境の読取確認とWave 0レビュー準備

## 2026-10-09追加 — 復元元Backupの確認可能範囲

基準main `5c73d14f49cd8dedd92b5e38289315aa507fdef8`（#1204）、branch `codex/restore-source-backup-audit`。追加の読取調査で、元projectと既存復元先の画面上の関連を確認した。ただし元Backup日時・復元完全性はUNKNOWN、Wave 0はNO-GOを維持する。

| 確認入口                                                                                          | 観測                                                                                                                                         | 結論・限界                                                                                                               |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 本番 `vtkzinaudznwbsjoyszk` → Database → Backups → Restore to new project → Previous restorations | `bunshin-restore-rehearsal-20261007` / COMPLETED / `07 Oct 2026 00:13:30 (+0000)`。既存記録のリンク先は `ltumqqwkorcfwgwavfrm`               | 本番projectの復元一覧にこの隔離projectが登録されている関連は確認。表示日時を元Backup日時・完了時刻・所要時間と断定しない |
| 同画面 Available Backups / Scheduled backups                                                      | 10月2〜8日の7件、Physical、Available側COMPLETED。最新 `2026-10-08 20:45:52 UTC`、復元記録より前の候補には `2026-10-06 20:44:04 UTC` 等がある | 個別復元とBackupとの対応ID/時刻は表示されない。「直前のBackupだったはず」と推定して確定しない                            |
| Previous restorationsのリンクを閲覧                                                               | 既存隔離projectのoverviewへ遷移する                                                                                                          | 元Backupの詳細画面ではない。復元元snapshot/期待件数の証拠は取得できない                                                  |
| Organization Settings → Audit Logs                                                                | 「Organization Audit Logs are not available on Free or Pro plans」、Team/EnterpriseへのUpgrade案内                                           | 現Pro契約ではこの画面の監査履歴は閲覧不能。履歴がないことの証拠ではない。Upgrade/購入は行わない                          |

既存Backup一覧は物理Backupの存在を示すが、Storage object本体は含まれない旨の注意書きがある。現在の本番とDDL試験後の復元先は時点とschemaが異なる。元snapshotと同時点の件数・checksum・期待値なしに現在の両DBを比較しても、完全な復元合格やデータ損失なしは証明できない。学習5tableは復元後に追加された空tableなので、それらの件数0を利用者データ復旧の成功条件にしない。

### 有償操作を増やさない停止点

この調査で元Backup日時を確定できる証拠は得られなかった。次はDB ownerが、**既存復元時の操作記録/receipt/画面記録から元Backup ID・timestampを特定する**。記録が残っていなければ、Supabaseへ既存復元のsource snapshot metadataを確認できるか問い合わせることを人間が検討する。Codexは問い合わせ送信・非公開データ送信を行っていない。

証拠が得られるまでは「不明」を何度確認してもPASSにならない。独立したDefinition教育レビュー等の準備は可能だが、元Backupの確認を省略したSTARTやDeploy承認にはしない。有料監査プラン・新project・新Restoreを自動追加せず、復元完全性/RTO/RPO/実role拒否は未確認のまま保留する。

今回実行したのはDashboardの既存記録と監査ログ利用可否の閲覧のみ。DB query/SQL再実行、Migration、Deploy、Restore、Backup作成、設定変更、承認、登録、START/STOP、Provider呼出し、Upgradeは行っていない。変更は本書のみ、秘密・利用者本文・生ログを保存しない。Markdown整形とdiff検証を行い、application test/buildはコード変更がないため未実施。

以下の記録は各調査時点の履歴。最新の停止点は本追記を優先する。

## 2026-10-09追記 — 復元後DDLの記録を確認

基準main `2e636258f67382b1ad56faf58f274e7326025a85`（#1203）、branch `codex/restore-ddl-history-evidence`。本人から復元後操作は「不明」と回答を受け、別指示で既存ログを読取確認した。

**履歴227件と学習5tableの不一致を説明する記録を確認した。** Supabaseの既存隔離project `ltumqqwkorcfwgwavfrm` → Logs → Last 7 days → Postgresで、`2026-10-07T00:29:03.205Z`（10月7日09:29:03.205 JST）のstatementログに、以下の隔離DDLリハーサルがある。

- `BEGIN`、lock_timeout=3秒、statement_timeout=60秒。
- 完了・未rollbackのPrisma履歴が227件で、学習5tableが未存在であることを検査するDO block。
- `20261006021000_personal_learning_persistence`、`20261006120000_personal_learning_call_admission`、`20261006140000_personal_learning_pilot_seat` の見出しと、対応5table/index/FK/CHECK/RLS・Seat保全triggerのDDL。
- `COMMIT`と、隔離環境用の完了確認SELECTを含む。Prisma履歴へのINSERT/UPDATEは当該statement内にない。sourceはdashboard。

既存repositoryの3migrationの対象・構造と、前回の5table存在/件数0というcatalog結果に整合する。したがって、復元後にSQLを直接使ったDDLリハーサルが行われ、Prisma適用履歴を登録していないことが、観測された不一致の説明となる。これは本番のPrisma履歴破損の証拠ではなく、隔離環境の変更経路の証拠である。

**限界:** statementログは送信SQLの記録であり、単独では全statementの成功・COMMIT結果を証明しない。現在のcatalogと合わせて確認しているが、全文byte一致/checksum、trigger全定義、履歴変更の全件追跡は未実施。実行者の本人同定、復元元Backup日時、復元データの同時点完全性、RTO/RPOは引き続きUNKNOWN。ログのsession識別子・生ログ・個人情報は文書へ転記しない。

### 監査経路と今回行っていない操作

SQL Editorのフル画面はアクセス不可の表示があり、SQL履歴一覧は取得できなかった。その後project一覧から同じ隔離projectへ戻り、閲覧可能なLogsで過去7日・Postgresフィルターを確認した。直近ログだけで不存在判定せず、復元日を含む期間の既存statementを確認した。組織全体の監査ログ・全期間の全件調査は行っていない。UI表示時刻とSQL内UTC日付は9時間差で一致する。

今回DB queryの実行、SQL再実行、履歴修正、ログ設定変更、Migration、Backup/Restore、Deploy、Definition承認、Participant登録、START/STOP、Provider呼出しは一切行っていない。画面の期間/ログ種別フィルターだけを操作した。誤遷移時は画面を再確認し、保存や変更ボタンを押していない。

### 更新された停止点

下記初回報告の「restore後の変更経路が不明」は、**上記DDL記録あり**へ更新する。履歴不一致を消すためのmigration resolve/履歴INSERT/再Migrationは不要な監査外操作であり実施しない。この隔離環境は「未変更の復元snapshot」ではなく、DDL試験後の環境として扱う。

Wave 0はNO-GO、復旧完全性はUNKNOWNを維持する。次の1確認は、DB ownerが復元元Backup日時・対象snapshotの記録を照合すること。既存ログの09:16頃のarchive recovery complete表示は復元起動の補助証拠であり、元Backup日時やRTOの代わりにはしない。新しい有償復元を自動開始しない。

変更は本書と本番証拠/Launch Runbookの参照追記のみ。Markdown整形・diff確認を行い、コード/DBが変わらないため今回の追加でapplication test/buildは再実行しない。前回32件PASSは前回の結果であり、今回のログ調査や復旧合格の証明へ転用しない。

以下は#1203時点の読取結果・未確認事項を残す履歴。現在の判断は本追記を優先する。

## 結論・実行境界

2026-10-09 JST。基準main `600a336aa6f88bec46334632d0094bb4acfa697a`（#1202）、branch `codex/wave0-restore-review-preparation`。

**Wave 0はNO-GOを維持。復旧リハーサル全体の合格はUNKNOWN。** 既存隔離projectはHealthyで読取できるが、学習関連tableの存在とPrisma履歴に不一致がある。復元元snapshotの証跡がないため、現状を「Backupを完全に復元できた」と判定しない。

今回は既存隔離projectへのREAD ONLY transactionによるmetadata/匿名件数SELECTと文書更新のみ。新規Backup/Restore、DB修正、Migration履歴修正、Deploy、設定、承認、参加者登録、START/STOP、Provider呼出しは行っていない。SQL snippetも保存しない。SQL照会履歴/アクセスログと業務データ変更は区別する。

## 既存隔離環境の実測

Supabase Dashboardのproject見出し、Healthy表示、Quick SQL Editorの結果が根拠。本番projectではなく既存 `bunshin-restore-rehearsal-20261007` / `ltumqqwkorcfwgwavfrm` を対象にした。Dashboardの「main Production」は当該project内branchラベルであり、本番Applicationの接続先である証拠ではない。

| 読取項目               | 結果                                                          | 判定の限界                                                          |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Project                | Healthy / micro / Tokyo ap-northeast-1                        | Applicationからの接続/認証は試験していない                          |
| Database               | postgres / PostgreSQL 17.11                                   | 前回本番読取17.6と異なる。復元元version/更新経路はUNKNOWN           |
| Prisma履歴             | 227件、最新 `20261005030000_training_support_skill_lifecycle` | 現本番の231件とは異なる。時点差だけか手動変更かは未確認             |
| 未完了履歴             | finished_at=NULLかつrolled_back_at=NULLは0                    | history外のDDL適用を検出する指標ではない                            |
| 20261006以降の履歴     | 0件                                                           | 学習5tableは存在するため、単純なPENDING判定でも完全一致判定でもない |
| public invalid index   | 0                                                             | 全index定義/checksum/性能の一致を検証していない                     |
| public未検証constraint | 0                                                             | 全データ/参照整合性や権限試験の代替ではない                         |

| 学習table                            | 件数 | FK数 / CHECK数 | RLS / FORCE / policy数 |
| ------------------------------------ | ---- | -------------- | ---------------------- |
| personal_learning_goal_confirmations | 0    | 3 / 0          | true / false / 0       |
| personal_learning_plan_revisions     | 0    | 1 / 3          | true / false / 0       |
| learning_definition_approvals        | 0    | 2 / 1          | true / false / 0       |
| personal_learning_call_admissions    | 0    | 1 / 2          | true / false / 0       |
| personal_learning_pilot_seats        | 0    | 2 / 5          | true / false / 0       |

Plan→Confirmationのscope全項目一致を要求するNOT EXISTS集計は0。ただしPlan自体0件なので、実データの復旧・履歴保持試験の合格ではない。今回読んだ件数は学習5tableのみで、ユーザー/Answer/相談/成果物本文は取得していない。RLS true・policy0はserver-only設計と整合するが、実role/BYPASSRLS/tenant拒否は未試験。

### 読取方法・再現入口

Supabaseの対象project見出しを確認→Quick SQL Editorの空欄へ入力→SQL全文を確認→Run→結果の件数/metadataだけ記録。ユーザーの保存済みSQLを上書きしない。

全照会を `BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; SELECT ...; COMMIT;` で囲んだ。1回目は `_prisma_migrations` の件数/最大migration_name/未完了数/20261006以降name・checksumと、`pg_class` / `pg_namespace` / `pg_policy` / `pg_index` / `pg_constraint` のcatalog集計。2回目は上表5tableのcount、Plan→Confirmationのscope付きNOT EXISTS、FK/CHECK数だけを取得。DML/DDL/function実行なし。UI警告はSQL全文が読取専用であると確認した上で進めた。

### 復旧合格までの残確認

1. **BLOCKER:** DB ownerが既存restoreの復元元Backup日時・実行者・復元後DDL/Prisma実行記録を特定する。履歴227件に学習tableが追加された経路を非公開証跡で照合する。現時点でmigration resolve/redeploy/履歴INSERTをしない。
2. **REQUIRED:** 復元元と同時点のschema/主要table件数/参照整合性の期待値を用意する。現在の本番件数との差は稼働後の更新を含むため、同一snapshot比較の代用にしない。
3. **REQUIRED:** App接続先の分離、実roleのアクセス否定、必要なら隔離Appでの読取復元確認、RTO/RPOを記録する。Auth/Storage objectはDB metadataだけでは証明できない。
4. **UNKNOWN:** 復元元Backup日時、復元時の所要時間、全schema一致、利用者データの同時点完全性、restore後の更新経路。新しい有償復元を自動提案・実行してこれらを隠さない。

## Wave 0設定案（未設定・人間承認待ち）

既存[Launch Runbook](../ai-training/MANABERU_STYLE_PRODUCTION_WAVE0_LAUNCH_RUNBOOK.md) Phase Eの候補を再利用する。人数・価格・secretの値を今回保存していない。前回[本番読取証拠](PRODUCTION_SAFETY_READ_ONLY_EVIDENCE.md)でCall Admission NOT_SET、人数policy未設定、承認0、Seat0を確認した結果は前回時点の観測であり、今回本番を再照会していない。

| 正本 / 実key                     | 承認用候補                                                                         | 条件                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| participantControl               | externalParticipantCap=100、internalParticipantCap=2、currentWave=0                | 1人ならinternal=1。CONFIGUREがcurrentWaveCap=0とrevisionを算出。外部募集0のまま       |
| version                          | PILOT_PARTICIPANT_CAP_V1                                                           | 外部絶対上限100、Waveは0/5/20/50/100。内部上限2は人間判断であり新しい絶対上限ではない |
| PERSONAL_LEARNING_CALL_ADMISSION | dailyAttemptLimit=12、maxConcurrent=1、maxRequestBytes=16384、maxOutputTokens=2048 | 対象Program全体UTC日次。失敗/retryも消費、未終了枠は翌日も保持。金額Hard Stopではない |
| model                            | gpt-5-miniは前回本番観測の候補                                                     | 実releaseのruntime modelと完全一致を確認後のみ。モデル変更なし                        |
| authority                        | workspaceId/groupId/serviceProgramId                                               | 現対象のUUIDをownerが非公開で照合。資料へ名簿/secretを記載せず、仮UUIDで設定しない    |
| 実行状態                         | Program SUSPENDED、Pilot enabled=false、両実行flag=false                           | 準備操作の別承認前に変更しない                                                        |
| pricing / 費用                   | UNKNOWN、価格版・予算・Alert・監視担当の承認待ち                                   | 仮単価、token=byte換算、無料/0円の断定をしない                                        |

Admission JSONは上記scope3項目+dailyAttemptLimit/maxConcurrent/model/maxRequestBytes/maxOutputTokensの**8項目のみ**。根拠は `packages/application/src/personal-learning-call-admission.ts` のstrict parser、`packages/database/src/personal-learning-call-admission.ts` のProgram scope/UTC集計。人数は `packages/capability-training/src/pilot-participant-cap.ts` のparser。12 attemptは3Definition×2人×2attemptという小規模の候補にすぎず、payloadが上限内で評価JSONを返せる保証や金額見積もりではない。

## 3Definitionの人間レビュー

既存[Definition Review Sheet](../ai-training/PERSONAL_LEARNING_PRODUCTION_DEFINITION_REVIEW_SHEET.md)に教育設計・Mission/Rubric・teaching guide案が揃っているため、重複資料を作らず今回mainとの照合と判断項目を追記した。3件ともUNKNOWN、APPROVEは行っていない。

特にCONTEXT_SETTINGはPROMPT_STRUCTUREと同じPROMPT_BASIC課題/Objectiveを継承している。背景選択を別Stepとして本人が理解できるか、現Rubricで評価できるかを人間が判断する。教育設計の修正が必要ならREVISION REQUIREDとし、同versionの内容を黙って変えない。

## 次に人間が行う1操作・停止点

### ローカル検証

- application `personal-learning-call-admission.test.ts`: 11件PASS。
- capability-training `pilot-participant-cap.test.ts` / `learning-definition-fixtures.test.ts`: 21件PASS。
- 変更MarkdownのPrettier整形、`git diff --check`を実施。変更は文書4件のみ、Application/schema/Migration/Provider変更なし。

合計32件は既存parser/fixtureのローカル回帰結果であり、復旧完全性、本番権限、実Provider評価、開始安全性の保証ではない。全体test/build、本番E2E、実端末/有償API試験は今回未実施。

**最初の1操作:** DB ownerが既存restoreの復元元Backupと復元後変更記録を照合し、履歴不一致の理由を確認する（読取/記録のみ）。新規restoreや本番Migrationではない。

その後、内部人数/Admission/予算の候補と3Definitionレビュー票を人間が判断する。レビュー合意と本番設定・APPROVE・登録・STARTの実行承認は別。#1176/OEM未適用Migrationを含むmain全体Deployも別Gate。今回の文書完成時点で停止する。
