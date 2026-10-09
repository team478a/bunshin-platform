# 本番安全条件の読取専用確認

2026-10-09追加: [既存隔離復元環境の整合性確認とWave 0レビュー準備](RESTORE_INTEGRITY_WAVE0_REVIEW_PREPARATION.md)。隔離DBには学習tableがある一方、対応Prisma履歴がなく、復旧合格はUNKNOWN。本書の本番観測を隔離環境の証明に流用しない。

## 結論

2026-10-09 JST、統合監査PR #1201マージ後の追加確認。基準main `2ca47be4b8fc5be0e44364b767b0eb741ea1e916`、branch `codex/production-safety-readonly-evidence`。

**Wave 0開始はNO-GO（準備不足）**。Personal LearningのDBは存在し対象Migrationの版も一致するが、Pilotは停止中、人数policy未設定、Seat0、Definition承認0、現在のVercel project production設定にCall Admission項目がない。既存のPreparation/承認/参加者準備の手順を利用する余地があり、新しい学習基盤を実装する必要があるという結論ではない。

Supabase管理画面とSQL Quick Editorで読取。SQLは `BEGIN READ ONLY` / `SET LOCAL statement_timeout='10s'` / metadataまたは匿名集計SELECT / `COMMIT` のみ。業務DML/DDL、Migration、Deploy、設定保存、Definition承認、参加者登録、START/STOP、Provider呼出し、Backup作成/Restoreは実施していない。Save as snippetも押さない。画面側のSQL照会履歴やアクセスログは本番業務データ変更と区別する。

ブラウザー接続不良は新規一時タブで回復。SQL再入力時にeditorへ追記され構文エラーが1回発生したため、空のeditorへ入力し直して結果を確認した。失敗照会をPASSとして扱わない。computer-useスキルに従い、読取以外の操作は行わない。

## 本番Application / DB

| 項目            | 今回の証拠                                                                                                                                                           | 限界                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 公開Application | Vercel inspect公開alias→GET `/v13/deployments/{id}`。`dpl_EtS1L7qyt1vPgDKpXXayrzifn4Se` / READY / production branch / SHA `d86115c7e1952c47fd56af77a4f44fd87933b48a` | #1201マージをDeployと扱わない。EVO/OEM V2未配備という前回結論を維持  |
| DB project      | Supabase `bunshin-platform-prod` / `vtkzinaudznwbsjoyszk`、Production / Healthy / Tokyo / micro                                                                      | Applicationの実接続先・roleの一致はcredential値を読まないためUNKNOWN |
| SELECT実行環境  | database `postgres` / role `postgres` / PostgreSQL `17.6`                                                                                                            | SQL EditorのroleでありApplication roleの証明ではない                 |
| Migration履歴   | `_prisma_migrations` 231 rows、未完了かつ未rollback 0                                                                                                                | 231件全てのchecksum/全catalog driftを検査したわけではない            |

DashboardのLast migrationは「No migrations」表示だったが、Prisma台帳には履歴が存在する。異なるMigration管理の表示を「Prisma未適用」の根拠にしない。

## Migration実適用・版確認

以下4件は `finished_at IS NOT NULL` / `rolled_back_at IS NULL`。DB checksumと基準mainのSQLファイルSHA256が一致。

| Migration                                         | 状態            | checksum                                                           |
| ------------------------------------------------- | --------------- | ------------------------------------------------------------------ |
| `20261006021000_personal_learning_persistence`    | APPLIED / MATCH | `f3a3a9ca4d98ba2502822ae9861b247d3f0a2ab36457440f81ff838c98ef3f5d` |
| `20261006120000_personal_learning_call_admission` | APPLIED / MATCH | `243c6f24a5d38ed67af600420c49972bc559ec36345905319aae6cb434770b3a` |
| `20261006140000_personal_learning_pilot_seat`     | APPLIED / MATCH | `fb8a3cb16ca5bc11c318d5e6c0f70d6eaa720e8dd2bb62d34085811344123fc3` |
| `20261008140000_learning_member_line_link`        | APPLIED / MATCH | `06e2f8fd0b6323d5ed2b209cb984e1fb51c903f7971d8420adb7ce9dd69fcf35` |

#1176の `20261007170000_add_oem_registration_billing` / `20261007173000_oem_billing_guardrails` は履歴に存在せず、対象5テーブルもcatalogにない。**この2件はPENDING**へ更新する（前回UNKNOWN）。今回適用しない。mainを一括Deployして全pendingを動かさない。

## RLS / Schema metadata

| テーブル                               | RLS     | FORCE RLS / policy数 | index数 / FK数 |
| -------------------------------------- | ------- | -------------------- | -------------- |
| `personal_learning_goal_confirmations` | enabled | false / 0            | 2 / 3          |
| `personal_learning_plan_revisions`     | enabled | false / 0            | 2 / 1          |
| `learning_definition_approvals`        | enabled | false / 0            | 1 / 2          |
| `personal_learning_pilot_seats`        | enabled | false / 0            | 4 / 2          |
| `personal_learning_call_admissions`    | enabled | policy/FORCE未再取得 | 4 / 1          |

最初のcatalog照会はCall ledger名を `personal_learning_call_attempts` としていたため対象が返らなかった。Repository SQLの正しい `personal_learning_call_admissions` で存在/RLS/index/FKを別照会した。不在・RLS無効と誤判定しない。

`postgres` / `service_role`: superuser=false、BYPASSRLS=true。`anon` / `authenticated`: superuser=false、BYPASSRLS=false。public policyのないServer-only table設計と整合するが、実Application role/認可・FK/index定義・越境の実操作までPASSとはしない。`PrismaPersonalLearningPilotRepository` / Seat / Assessment/Admissionのserver認可を維持する。RLSを無効化する提案はしない。

## Pilot / Providerの現在値

`service_programs.settings ? 'personalLearningPilot'` の対象は1件。全員のID・名前・本文は取得せず数と選択fieldだけを集計した。

| 項目                             | 結果                                                        | 開始前に必要なこと                                                                                           |
| -------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Program status / pilot.enabled   | SUSPENDED / false                                           | 停止を維持したPreparationと、開始前Gateの承認。現在の安全なOFF状態を勝手に変更しない                         |
| enrollmentIds数                  | 0                                                           | 本人Enrollment・Seat・scopeをtrusted操作で準備、client入力だけを信用しない                                   |
| internal / external Seat数       | 0 / 0                                                       | 内部1〜2人を準備。外部登録は今回不要                                                                         |
| external / internal / wave cap   | 全てnull（未設定）                                          | policy版/revision/累計Wave0を含め人間承認した設定が必要。絶対100上限のコードがあっても設定準備完了とはしない |
| AI_TRAINING Definition Approval  | 該当行0件（集計null）                                       | 対象3DefinitionのHuman Review→正確な版の承認。承認済みへ自動昇格しない                                       |
| managed OpenAI PRODUCTION ACTIVE | 1件 / model `gpt-5-mini` / paused=false / credential有無SET | encrypted key本文は取得しない。Provider疎通/予算/実費用/採用承認は未確認。既存modelを変更しない              |

承認集計は全AI_TRAININGの行を対象とし0件だったため、対象Programの3Definitionも未承認。誤って他ServiceのApprovalで利用可能としない。

Vercel GET `/v10/projects/prj_2HlX8dPsGNKYP3BCvNoUEKBoXyvv/env` のproduction targetエントリを名前/種別/存在だけ確認。値を復号・表示しない。

- SET: `PERSONAL_LEARNING_PRODUCTION_PREPARATION`、`PERSONAL_LEARNING_PILOT_OPERATIONS`、`PERSONAL_LEARNING_PILOT`、`PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT`、`DATABASE_URL`、`DIRECT_URL`、`ENCRYPTION_KEY`。
- NOT_SET（現在project productionエントリ）: `PERSONAL_LEARNING_CALL_ADMISSION`。
- flagの値ON/OFF、Preparation authority、日次/同時/byte/output上限、実Deploymentへ入った環境snapshotはUNKNOWN。SETは有効な値を保証しない。稼働版が参照するAdmissionを確認してから開始する。
- `vercel env ls` はworktree未linkのため取得できず、project指定GETへ切替。link/環境保存はしない。

`apps/web/src/services/personal-learning-call-admission.ts` はpolicy欠損でDENIED、Providerを呼ばない。現在の欠損を許容fallbackで埋めず、開始前の明示設定・実Deployment反映のGateにする。

## Backup / Restore

2026-10-09追加読取: [隔離復元報告のDDL履歴追記](RESTORE_INTEGRITY_WAVE0_REVIEW_PREPARATION.md)で、10月7日09:29 JSTの隔離DDLリハーサルstatementを確認。学習5tableとPrisma227件の不一致を説明する記録は見つかったが、元Backup日時・本人同定・復元完全性・RTO/RPOはUNKNOWN。履歴修正/再Migrationは行わない。

Supabase Database Backupsの既存表示のみを確認。

- 日次Physical Backup、表示7件COMPLETED。最新は `2026-10-08 20:45:52 UTC` / `2026-10-09 05:45:52 JST`。
- Previous restorations: `bunshin-restore-rehearsal-20261007` / COMPLETED / 表示 `2026-10-07 00:13:30 UTC`。
- 復元元Backup・実行者・整合検証合否・RTO/RPOはUNKNOWN。COMPLETEDを復元検証PASSにしない。
- Storage object本文はDBBackup対象外という注意書きあり。Storage復旧と復元後の削除/Privacy整合はUNKNOWN。
- 新Backup作成、Restore、費用追加は実施しない。既存隔離復元を利用した整合確認を優先する。

## 更新されたGateと次の最小作業

| Gate                               | 判定                | 判断                                           |
| ---------------------------------- | ------------------- | ---------------------------------------------- |
| 対象Personal Learning Migration/版 | PASS（対象4件のみ） | DB適用・checksum一致。全DB drift合格ではない   |
| RLS/実Application認可              | 部分確認 / UNKNOWN  | RLS存在、role条件は取得。実role・越境は未検証  |
| Pilot停止                          | PASS（DB Program）  | SUSPENDED / enabled=false。環境flag値はUNKNOWN |
| 人数policy / Internal Seat         | NOT_READY           | 未設定 / 0人                                   |
| Definition Human Approval          | NOT_READY           | 0行                                            |
| Call Admission / 実Provider        | NOT_READY / UNKNOWN | 現在project設定なし、実Deployment/実API未検証  |
| Backup / 復元整合                  | COMPLETED / UNKNOWN | 既存Backup/復元表示と整合検証を分離            |
| #1176新課金                        | NO-GO               | 未配備・2Migration未適用。内部学習準備と分離   |

次は **既存隔離復元の整合検証記録を確認する読取作業** と、trusted Preparationに渡す設定案/3Definitionレビュー資料の人間確認。SQLで直接INSERTしたり、承認前にINITIALIZE/APPROVE/登録/STARTしたりしない。実設定は別の明示承認を待つ。

今回の成果は文書のみ。取得できなかった値を推測で埋めず、前回の時点付き監査を削除しない。検証: SQL結果の可視確認、4checksum一致、Markdown format、diff check。本番E2E/実課金/実送信/新テストは未実施。
