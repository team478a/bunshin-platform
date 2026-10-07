# OEM Registration Billing V2 本番Migration安全監査

## 判定と範囲

2026-10-07 19:00 JST時点の監査。**NO-GO（本番適用承認ではない）**。PR #1176の実装・CI成功と、本番DB適合・復旧検証成功は別である。

- 基準main: `97838a724183c9b1fe1c0e33b72a2cff17d7e57e`。
- branch: `codex/oem-billing-migration-safety-audit`。文書のみ変更。
- 実装commit: `d7a67e4c778e33d12496a293349034baef8db4f1`、[PR #1176](https://github.com/team478a/bunshin-platform/pull/1176)はマージ済み。
- [main CI](https://github.com/team478a/bunshin-platform/actions/runs/37603118046)はsuccess。
- 本番Migration / Deploy / DML / DDL / 課金 / 価格公開 / cutover / Pilot操作は実施していない。
- Supabase Dashboard、Vercel GET metadata、Repositoryを読取。DBには`BEGIN READ ONLY; SELECT ...; COMMIT;`のmetadata照会のみを試みたが、結果取得中のブラウザーtimeoutによりDB結果は未確認。SQL Editorのquery snippet作成・照会履歴はDB業務データの変更とは区別する。秘密情報・個人情報・本文は取得/記録しない。

## 実環境で確認した証拠

| 項目                   | 今回の確認結果                                                                                                   | 根拠 / 限界                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Production DB          | `bunshin-platform-prod` / ref `vtkzinaudznwbsjoyszk`、Tokyo `ap-northeast-1`、micro、Healthy                     | Supabase project overview。Application接続先・DB role/versionは今回未再確認                                |
| 最新Backup             | `2026-10-06 20:44:04 UTC` / `2026-10-07 05:44:04 JST`、COMPLETED                                                 | Database Backups / Restore to new project。7件のCOMPLETED表示。適用直前の最新性は再確認する                |
| 隔離復元               | `bunshin-restore-rehearsal-20261007` / ref `ltumqqwkorcfwgwavfrm`、COMPLETED、表示日時 `2026-10-07 00:13:30 UTC` | Previous restorations。日時の意味、復元元Backup、実行者、RTO/RPO、整合検証の合否はUNKNOWN                  |
| Storage復旧            | UNKNOWN                                                                                                          | DBBackupだけではStorage object本文を復元できない。Storageも含めた復旧範囲を人間が確認する                  |
| Production Application | `https://www.watashi-works.com`、Vercel deployment `dpl_9Fkq3cdX3B8LgBuLmiWn4GYN2Gzg`、READY                     | `vercel inspect`およびGET `/v13/deployments/{id}`。作成日時 `2026-10-07 06:44:28 UTC`                      |
| Deploy SHA             | `4e2bc01eb0bb1181bcd967d3324c30448ebfaa72`、branch `production`、**BEHIND**                                      | Vercel `gitSource.sha`と`meta.githubCommitSha`が一致。mainまで実装commitとmerge commitの2件。#1176は未配備 |
| DB履歴 / drift / RLS   | UNKNOWN                                                                                                          | 今回SELECT結果を取得できていない。過去監査の件数・未適用一覧を現在値として転記しない                       |

過去の[Personal Learning監査](ai-training/MANABERU_STYLE_PRODUCTION_READ_ONLY_AUDIT.md)は過去時点の証拠であり、今回の復元COMPLETEDやDeploy SHAにより当時のUNKNOWN/古いSHAが解消した部分だけを上表で更新する。復元COMPLETEDは復元検証PASSを意味しない。

## Migration Inventory

SQLの正本は`packages/database/prisma/migrations/`配下。今回の2件は既存データ削除・自動backfillを行わないが、純粋な新テーブル追加だけではない。

| Migration                                                   | 主な変更                                                                                                        | 適用前確認 / リスク                                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261007170000_add_oem_registration_billing/migration.sql` | 5新テーブル、7 usage nullable列、3 invoice nullable列、4 pricing default列、FK/CHECK/partial unique/RLS/trigger | 旧pricing unique indexを先頭でDROPする。既存pricingの月初適合、旧index実在、membership複合unique実在、既存usage/invoiceのFK/CHECK検証、lockを確認 |
| `20261007173000_oem_billing_guardrails/migration.sql`       | membership CHECKの拡張、usage NULL拒否、pricing/history保護trigger                                              | CHECKのDROP/ADDと既存行scan。1件目だけ成功して2件目失敗した状態では新Applicationを公開しない                                                      |

新テーブルは`commercial_pricing_audits`、`oem_billing_policies`、`oem_registration_periods`、`oem_offering_periods`、`oem_contract_periods`。全5件にRLS ENABLE、public policy追加/FORCE RLSなし。実App roleのBYPASSRLS/owner条件とRepository認可を別々に検証する。隔離DBでの成功は本番role検証の代わりにしない。

`ALTER TABLE`はlock、CHECK/FKは既存行検証を伴う。PostgreSQL 17の[ALTER TABLE仕様](https://www.postgresql.org/docs/17/sql-altertable.html)を参照。定数DEFAULT追加に全行書換えが不要でも、lock-freeを意味しない。[列追加仕様](https://www.postgresql.org/docs/17/ddl-alter.html)。本番時間・最大待機・許容停止時間はUNKNOWN。

PrismaはRepositoryで`6.19.3`に固定。両SQLに明示的な外側BEGIN/COMMITはなく、Vercel runnerにも独自transaction/lock timeout制御はない。[Prismaの従来Migrate説明](https://www.prisma.io/blog/prisma-migrate-dx-primitives)はPostgreSQLの明示transactionをopt-inとして説明する。実engine/送信方式でどこまでatomicになるかは未実測であり、途中DDL残存を断定しない。**同一版で途中失敗注入・catalog検査・復旧リハーサルを隔離環境で確認するまで、全pending一括rollbackを保証しない。** 先行Migration成功後に後続Migrationが失敗する境界も検証対象とする。Prisma 8の新しいtransaction説明を6.19.3へ流用しない。

## DeployとMigrationの結合

`apps/web/vercel.json`のbuildは次の順序である。

`pnpm db:migrate:vercel` → `pnpm db:assert-ready` → `pnpm turbo run build --filter=web`

`packages/database/scripts/deploy-migrations-for-vercel.mjs`はproductionで全pendingに`prisma migrate deploy`を実行する。新Application公開前に旧Application稼働中のDBを変更する。**production branch更新はMigration開始も伴うため、単なるDeployだけという承認では進めない。** 実DBpending一覧がUNKNOWNのまま#1176の2件だけと仮定しない。

`assert-schema-ready.mjs`はRepository最新Migration名の完了を確認するだけで、全履歴checksum・failed rows・table/index/FK/RLS/trigger・既存データ適合を網羅しない。schema Gate成功だけを完全な安全確認とみなさない。

## 旧Application / cutover前の影響

- cutover未設定では旧課金計算を維持するが、新Applicationに影響がないわけではない。
- `group-participation.ts`、`service-participation-registration-repository.ts`、`service-participation-membership-repository.ts`は正式登録/終了時に`oem-billing-history.ts`の新履歴へ接続する。新tablesが不足すると既存参加処理も失敗し得る。
- `program-runtime.ts`、`commercial-billing-service.ts`は`requireTrainingOemOffering`を使用。OEM契約があるAI研修の採用/契約操作にはMANABERU_STYLE提供区分が必要で、不足はREVIEW_REQUIRED。直営/内部PilotはOEM契約がない場合に除外される。
- 新pricing triggerは旧Applicationの公開済み料金更新/削除も拒否する。旧画面/workerと新DBの共存を隔離検証する。
- 自動backfillはない。既存正式登録・提供区分・契約期間の根拠レビュー、明示初期履歴、shadow比較、将来月cutover、料金publish、請求発行は別々の人間承認。日付を推定しない。
- cutover後の旧MAUアプリrollbackは新対象月の誤課金リスクがある。請求/確定処理を停止・根拠保全しforward fixを優先する。DB履歴削除・保護trigger解除を通常rollbackにしない。

## 残るRead-only Preflight

接続が安定した後、承認済みread-only接続で次を採取する。個人別行・接続secret・SQL本文付き他session・成果物本文は採取しない。

1. `_prisma_migrations`全件の名前/checksum/finished/rolled_back状態をRepositoryと比較し、全pending/失敗/drift疑いを一覧化する。
2. `pg_class`/`pg_constraint`/`pg_indexes`/`pg_trigger`/`pg_policies`で対象table/index/FK/CHECK/trigger/RLSとApp role属性を確認する。
3. 既存pricingの月初違反・重複、membership状態CHECK違反を人数集計だけで確認する。ゼロ件を証明できなければ停止する。
4. 対象既存tableのsize/row estimate、長時間transaction・lock待機の集計を確認する。許容lock時間・停止方法を決める。
5. 実App DATABASE_URL/DIRECT_URL接続先はsecretを表示せずproject refとroleだけで照合する。旧App/cronを含めたwriter停止/drain手段を確認する。
6. 隔離復元の実行者・復元元・整合検証・RTO/RPO、Backup後のデータ差分と削除/retention再適用方法を[Backup Runbook](BACKUP_RESTORE_RUNBOOK.md)に従って確認する。

metadata結果未取得のため、2Migrationの本番状態はともに**UNKNOWN**。未配備Applicationだけを根拠にDBをPENDINGと断定しない。

## GO / NO-GOと優先順位

| Gate                                    | 結果     | 分類 / 次の条件                                        |
| --------------------------------------- | -------- | ------------------------------------------------------ |
| main CI / SQLレビュー可能               | PASS     | main CI成功、SQLはreview可能。本番成功とは別           |
| Production Application / DB project識別 | PASS     | 実画面/GET metadataで識別。App接続先照合は別Gate       |
| 最新Backup成功表示                      | PASS     | 適用直前に最新性を再確認、Storage復旧範囲は別          |
| 復元整合検証 / RTO / RPO                | UNKNOWN  | BLOCKER。COMPLETED表示以外の検証証跡が必要             |
| 実DBpending / checksum / 既存行適合     | UNKNOWN  | BLOCKER。安全なmetadata照会の完了が必要                |
| 実DBrole / RLS / schema                 | UNKNOWN  | BLOCKER。新旧roleと認可を検証                          |
| lock / 旧App共存 / 途中失敗復旧         | UNKNOWN  | BLOCKER。復元先/隔離環境のrehearsalと停止計画          |
| 全pending Migration + Deploy手順        | REQUIRED | BLOCKER。自動Migration範囲と旧worker影響を人間レビュー |
| 初期履歴 / shadow / pricing / cutover   | 未実施   | 課金V2開始前必須。本番schema配備と分離                 |

最初に人間が行う1操作: **既にCOMPLETEDの隔離復元について、整合検証結果（実行者・復元元Backup・検証合否）を確認し記録する。** 今回新たな本番復元を開始する指示ではない。

次の小さな作業単位は、安全なDB metadata確認と隔離rehearsal。途中失敗・旧App互換など不足を実測してから、必要なMigration/runner改善PRを別承認で決める。今回、コード・SQL・secret・設定を変更せず監査で停止する。

## 承認後の適用順序（今回は実行しない）

1. 全Gate証跡をレビューし、Migration実行者/復旧担当/時間帯/停止条件を承認。
2. 最新Backupと復元可能性、writer停止/drain、実DB履歴・接続先を直前再確認。
3. 承認対象の全pendingを正本順に適用。各失敗で停止し、新Appを公開しない。部分完了時はcatalog/historyを保全して復旧担当へ引継ぎ、無条件再送/resolve成功偽装をしない。
4. table/index/FK/CHECK/RLS/trigger/全履歴を照合してから新Applicationを配備。Deploy時runnerが再適用せずno-pendingで終了することも確認。
5. cutover/価格公開は未設定のまま、既存ログイン/正式登録/OEM採用・契約操作/旧課金表示をSmoke確認。
6. 初期履歴レビュー→shadow→将来月cutover/料金公開→請求は別承認とする。

検証: 文書format/diff確認。今回コード無変更のため全回帰を再実行していない。#1176/main CIと実装報告の隔離DB結果を参照し、本番実測と混同しない。
