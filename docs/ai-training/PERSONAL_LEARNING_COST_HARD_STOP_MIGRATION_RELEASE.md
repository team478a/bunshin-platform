# Personal Learning 費用Hard Stop Migration限定release

## 1. 調査した内容

対象はproduction `60cc99c0b6a75ec38ddc733f1a9058e306863e14`。同SHAのVercel buildはread-only schema gateで停止し、直前の成功Deployment `4b34e1fe6683ddfd935a7bff96052564e96dae1c`が公開継続中である。

2026-10-10の本番read-only監査では、production系統の先頭231 Migrationと本番成功履歴が件数・名前MD5 `6051b4827ef93b0c9da591c2a7e8bdfe`まで一致した。unfinished / rolled-backは0件。pendingは`20261010070000_personal_learning_call_cost_reservation`の1件だけである。

対象tableは0行、追加予定2列とCHECK制約は未作成、待機lockは0件。最新物理Backupは2026-10-10 05:44:36 JSTで、画面上は直近7日分を確認した。隔離restore rehearsalの最新状態と復旧責任者は今回再確認していない。

PR #1218は2026-10-10 19:42 JSTにproductionへmergeされたが、Vercel Deployment `dpl_3uFR4e4rfFfVstUpt8nkKpeguTfq`はMigration開始前のprobeで停止した。Supabase Postgres logの`MIGRATION_BOUNDS_NOT_ACTIVE`と、直後のread-only照合でMigration未適用、追加列/制約なし、待機lock 0、runner session 0を確認した。旧Deploymentが公開継続中である。

## 2. 変更したファイル

- Vercel Production build順をbounded Migration → read-only readiness → 強制Web buildへ変更
- 対象Migration SQLへtransaction-localのlock / statement / idle timeoutを追加
- migration runnerを監査済みmigration名集合・対象1件・0行/列/制約/lock条件へ限定
- process timeoutと固定reasonのfail-closed処理を維持
- process終了管理、単体・統合fixture、release契約testを追加
- Deployment Guide、credential rotation runbook、Decision Log、本release報告を更新

schema操作そのもの、Runtime機能、Provider、Pilot設定、参加者、LINE、課金設定は変更しない。未適用の対象Migration SQLには実行上限だけを追加する。main全体はproductionへ取り込まない。

## 3. 主要な設計判断

credential rotation専用releaseで一時的に外したmigration入口を復帰する。Git連携をskipさせない`ignoreCommand: exit 1`と強制Web buildは維持する。

Production以外ではrunnerをskipする。Supavisor session poolerでは一般GUCのstartup `options`が反映されなかったため、DB上限は対象Migrationの明示Transaction内で`SET LOCAL`する。runnerは対象Migrationが最新で固定上限を持つこと、本番が監査済みの直前または適用済み状態であることをprobeしてから`prisma migrate deploy`を1回実行する。自動retry、resolve、rollbackは行わない。

既定上限はlock 5秒、statement 60秒、process 300秒。対象tableは0行だが、実行時にlock取得できなければ適用せずbuildを停止する。

## 4. 実行した検証

- hotfix runner単体・release契約test: 2 files / 39 tests PASS
- disposable PostgreSQLへのproduction系統全232 Migration適用: PASS（unfinished / rolled-back 0件、最新は対象Migration）
- Migration boundsを含むDB統合test: 1 file / 176 tests PASS
- 全体test: 25 tasks PASS（Web 3,116 tests、DB 900 testsを含む。live test 2件は既定どおりskip）
- typecheck: 25 tasksおよびLearning UI PASS
- lint: 25 tasksおよびLearning UI PASS（既存の未使用eslint-disable warning 1件、error 0件）
- format check: PASS
- Webを含む全体build: 13 tasks PASS

統合検証に使ったPostgreSQL containerは削除済み。GitHub CIの未完了をPASSにしない。

## 5. 未解決事項

- PR #1218はmerge済みだがMigration開始前に停止し、新Deploymentは公開されていない。
- hotfix PRのmerge、Migration再実行、Deployは未承認・未実施。
- 隔離restore rehearsalの最新状態と復旧責任者は未再確認。
- merge直前にBackup、pending、lock、公開SHAを再確認する。
- Migration成功後も価格、日次予算、Provider側budget、既存Admission設定は未設定のまま。Pilot、Provider送信、実課金を開始しない。

## 6. 次Phaseへ進める条件

hotfix PRの差分とCIを人間がレビューする。merge直前のread-only再確認後、対象SHAのMigrationとDeployを一つの操作として明示承認する。成功後はMigration finished、追加列/CHECK、readiness、Vercel READY、公開SHA、healthを確認する。Pilot開始や本番設定変更は別承認とする。
