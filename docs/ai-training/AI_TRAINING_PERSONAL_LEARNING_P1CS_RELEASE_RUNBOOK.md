# Personal Learning P1-C-S 本番適用の承認条件と手順

保存基盤の本番配備、Definitionの人間承認、Personal Learningの利用開始を分離する。現時点は本番操作NO-GO。本RunbookのマージはMigration、deploy、Definition承認、P1-E着手の許可ではない。環境ownerとリリース担当者が未確認条件を合格扱いにせず、証跡を揃えて別途実行承認を得る。

## 現在の確認状態

2026-10-06 JSTの読み取り確認。元のdirty checkoutは変更せず、既存managed worktreeの最新mainから文書専用branchで作業。

- main: `c152a09ed11fc19eebd8d84dd851651de22b8b19`。[#1149](https://github.com/team478a/bunshin-platform/pull/1149)は2026-10-06T03:13:11Zにmerge済み。[PR CI](https://github.com/team478a/bunshin-platform/actions/runs/37404124965)のverify / databaseは両方成功。
- [merge後main CI](https://github.com/team478a/bunshin-platform/actions/runs/37407942406)は初回確認時database成功、verify実行中。実行承認時は採用SHAの最終結果を再確認する。
- production branch: `87c5fafcdf9b84c67dd33aef41860368415ca789`。GitHub最新Production deploymentも同SHA、status=success、作成時刻2026-10-05T15:43:24Z。GitHubメタデータだけでは現在の公開aliasや本番DB状態は保証しない。
- 上記productionとmainのMigrationファイル差分は`20261006021000_personal_learning_persistence`の1本。productionのreadiness定数は`20261005030000_training_support_skill_lifecycle`。実DBでP1-C-Sが未適用かどうかは未確認。
- release差分はP1-A/B/C/Dと設計文書も含む。P1-C-Sだけのリリースと決めつけない。

実装と隔離DBの検証は[実装報告](AI_TRAINING_PERSONAL_LEARNING_P1CS_PERSISTENCE_IMPLEMENTATION.md)を参照。今回は本番DB接続、Vercel設定変更、停止、Migration、deploy、承認レコード作成をしていない。

## 本番ビルドの適用順序

正本は[Deployment Guide](../DEPLOYMENT_GUIDE.md)、`apps/web/vercel.json`、`packages/database/scripts/deploy-migrations-for-vercel.mjs`。

既存Git連携はproductionだけを許可する。production buildはMigration→readiness→Web buildの順であり、新Web公開より先に共有DBが変わる。後段build失敗でも成功したMigrationは戻らない。手動再deployも同じ経路を通り得るので、確認目的でbuildを起動しない。

runnerはPrisma migrate deployで全pending Migrationを適用する。本番DBのpending一覧が想定の1本以外なら停止し、各Migrationの互換性をレビューする。Feedback maintenanceがpendingなら[専用Runbook](../improvement/IMPROVEMENT_MAINTENANCE_RELEASE_RUNBOOK.md)の停止・drain条件を満たす。Git差分にないことだけをDB適用済みの証拠にしない。

## Gate 1 対象とBackup

環境ownerと担当者が以下を確認し、識別子・日時・合否を残す。接続URLの資格情報、dump、本人のGoal・相談情報をPRへ貼らない。

1. 公開aliasの実Deployment SHA、production branch、採用候補SHA、対象Supabase projectの一致。
2. 採用SHAのverify / database CI成功、全release差分とMigration SQLレビュー。
3. 承認済みread-only経路での`_prisma_migrations`のfinished / rolled_back状態、pending一覧、失敗Migrationの有無。.envや秘密情報を出力しない。
4. [Backup Runbook](../BACKUP_RESTORE_RUNBOOK.md)に従った最新成功Backup、保持期間、隔離restore rehearsal、復旧責任者、許容停止時間。
5. 旧アプリが動く間の互換性、必要な停止範囲と進行中処理の確認方法。未確認ならNO-GO。

## Gate 2 DDLと旧V1の互換性

P1-C-S SQLは3新規テーブル、既存Goalの複合unique index、FK / CHECK、RLSのみ。seed、backfill、fixture承認、旧Goal本文変更はない。ただし通常のCREATE UNIQUE INDEXは既存`program_member_goals`への書込を妨げ得る。追加のみだから無停止・無影響とはしない。

本番相当の隔離環境で、Goal件数・容量を個人情報なしの集計で確認し、index作成時間、待機lock、旧V1のGoal保存・取消・Export・削除との共存を検証する。実行側DB roleで新テーブルを利用でき、匿名・一般クライアントの直接read/writeを許可しないことも確認する。隔離DBのsuperuser検証だけでは本番roleのRLS挙動は保証しない。

このSQLに専用lock_timeout / statement_timeoutや明示BEGINはない。移行失敗時の未完DDLを含めて担当者が中断・診断手順を確定する。適用済みファイル編集、失敗行削除、確認なしのmigrate resolveはしない。許容時間を満たせない場合、停止計画または別修正PRをレビューする。

## Gate 3 承認後の本番適用

以下は将来の承認済み操作であり、今回未実施。

1. 対象SHA、Backup、pending一覧、DDL互換性、停止・再開手順について人間の実行承認を得る。
2. 必要な停止・drainを確認する。CI成功やlease期限経過だけで停止を証明しない。
3. main→productionのリリースPRを人間がレビューし、承認後にmergeする。productionへ直接pushしない。この文書PRはmain向けでありリリースPRではない。
4. Vercel buildのMigration / readiness / Web buildを個別に確認する。手動Migrationを選ぶ場合は実行者・対象・方法を別承認し、同時buildとの競合を避ける。
5. 実DBのMigration finished、3テーブルのscope FK / CHECK / RLS、旧Goal indexを確認する。意図しない承認seedやbackfillがないことを確認する。
6. 公開SHA、live / ready、既存30日V1の認証・初期設定・Goal・Mission・LINE・Progress・本人Export / 削除を承認済み非破壊的範囲で照合する。smokeのために実データ削除、課金、Provider発注をしない。

成功しても「未接続の保存基盤を配備した」まで。Consultation / 保存UI / Router / Assignment / Teachingは有効にならない。

## Gate 4 Definition承認と利用開始

3 Definitionはreview fixture。テストの合成APPROVEDレコードをコピーせず、Migration成功をDefinition承認にしない。人間がSkill、Objective、Prerequisite、Core Concepts、Safety、Common Mistakes、Practice Pattern、Rubric参照、既存Mission対応を固定版ごとにレビューする。対象Service、packageKey / definitionKey / version、担当者、根拠、承認日時を残す。

実装は同ServiceのACTIVE SERVICE_OWNER / SERVICE_ADMINかつACTIVE User、未来でない承認日時、完全一致版を要求する。承認管理API / UIは未実装。認証を伴う承認操作・監査・取消手順は別レビューが必要で、今回SQL INSERTや管理UIを追加しない。未承認はDefinition Gapを維持し、DEPRECATEDは新規保存・確認を拒否する。過去Planの版固定履歴は保持する。

利用開始には別途、認証済みactor / 5軸scopeのサーバー解決、本人確認、冪等再送・CAS競合UX、Privacy / Export / 削除、実端末での復元を検証する。P1-E実装や本番利用の承認とは別。

## 障害時の停止と復旧

Migration失敗、ready不一致、旧V1回帰、意図しないデータ作成、scope漏れがあれば公開・利用開始を停止する。DB移行後のWeb build失敗ではDB適用状態を確認する。

追加テーブルを即DROPせず、Goal正本・確認証跡・Plan履歴を保持する。旧Deploymentに戻す場合もDB互換性とExport / 削除をレビューする。旧版はPersonal LearningのExport追加を持たないため、既にデータがあれば単純rollbackでは不足する。restoreは削除済みデータを復活させ得るので、Backup時刻以降の削除・保持期限処理を再適用してから再開する。原則forward-fix、実データ削除・restoreは別承認。

## 承認記録

- 採用SHA / 公開SHA、日時、実行者 / 環境owner:
- 対象DB識別子、pending一覧、Migration結果:
- CI、Backup / restore証跡、DDL時間・lock / 互換性結果:
- 停止範囲、drain証跡、再開条件、復旧責任者:
- Definition承認の有無と根拠:
- 基盤配備 Go / No-Go、利用開始 Go / No-Go:

空欄・未確認・古いSHAの証跡は合格ではない。今回の変更はRunbookとDeployment Guide参照のみで、コード・schema・Migration・設定は変更しない。
