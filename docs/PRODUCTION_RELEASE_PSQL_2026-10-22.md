# 2026-10-20リリースの3 migration：psql経由の適用

状態：Draft PRで検証中。本番でのPreview・適用・Vercel反映は未実施。

## 対象と変更理由

対象は`20261019120000_learning_provider_abstraction`、`20261020100000_personal_learning_tool_feature_updates`、`20261020120000_ops_morning_digest_runs`の3件だけ。元のmigrationファイルは変更しない。

Prismaの接続URLのstartup optionsで指定したtimeoutがsession pooler経由では期待どおり有効にならなかった。psql接続後にSQLの`SET`で設定し、同じ接続の`current_setting`を確認してから元のSQLを実行する方式に変更する。poolerより先の`pg_stat_ssl`を、クライアント側TLSの判定には使わない。

## GitHubでの実行

1. PRを確認・マージし、verify / database CIの成功を確認する。最新バックアップと対象projectを再確認する。
2. Actionsの **Apply approved production migrations (2026-10-20 release)** をmainから実行する。`project_ref`は既存の対象project ref、`confirmation`は画面に示す確認語を入力する。秘密値は入力欄やログへ貼らない。
3. 初回は`mode=preview`を選ぶ（既定）。GitHubのProduction承認後、`RELEASE_PSQL_PREVIEW_VERIFIED`を確認する。Previewはsession設定、migration lock、identity、履歴checksum、未適用集合、適用済み未記録のDDL痕跡を確認する。DDLとPrisma履歴登録は行わない。
4. Preview成功後、同じmain SHAで`mode=apply`を実行する。Production承認後、`RELEASE_MIGRATIONS_APPLIED_AND_VERIFIED`と後続の`db:assert-ready`成功を確認する。
5. DB確認後のコード反映・画面smoke・flag判断は[既存の本番反映手順](PRODUCTION_RELEASE_PREFLIGHT_2026-10-20.md)に従う。このworkflow自体はVercelをデプロイしない。

接続はGitHub Production Environmentの既存`DATABASE_URL` / `DIRECT_URL`と`SUPABASE_SESSION_POOLER_HOST`を再利用する。追加の資格情報や恒久DB設定は不要。workflowとDB検証jobはUbuntu 24.04とPostgreSQL client 16を使用する。従来のPowerShell direct接続runnerを、このpsql経路の代用として再試行しない。

Previewではpsqlのlock保持中にPrismaのread-only接続も確認する。履歴登録に必要な2本目の接続枠とTLS設定が使えない場合は、DDLより前に停止する。

## 適用時の制御

- psqlの同一sessionで`lock_timeout=5秒`、`statement_timeout=60秒`、`idle_in_transaction_session_timeout=60秒`を設定・確認する。全プロセスは既定5分、workflowは15分で打ち切る。
- 接続先は既存の承認済みSupabase project / session pooler 5432 / postgres DB・roleだけ。TLSはクライアント接続でrequire以上にする。認証値は子プロセス環境にだけ渡し、引数・生ログに出さない。
- 適用済み履歴のchecksumをリポジトリの元SQL全件と比較する。不一致、失敗履歴、同名の重複完了履歴、3件以外のpending、未記録の既存DDLがあれば止まる。履歴の書き換えで通さない。
- 過去履歴はPrisma 6と同様にLF/CRLF改行差だけを許容する。SQL内容の変更は許容しない。今回新しく記録するchecksumは元SQLの実バイト列と完全一致させる。
- Prismaと同じadvisory lockをpsql sessionが全処理中保持する。競合時は待たず停止する。各SQLをtransactionで適用し、COMMIT後にPrisma 6の`migrate resolve --applied`で履歴を記録し、元SQLのchecksumと完了状態を再確認する。
- resolve子プロセスだけ`PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`を指定する。親psqlが同じlockを保持しているための自己競合回避であり、通常deployのlockやProduction環境変数は変更しない。

## 失敗時

失敗または結果不明時は自動再試行しない。元のSQLは1件ごとにtransactionでrollbackするが、COMMITと履歴登録の間は別操作なので、SQLだけ完了した可能性がある。特に`release-sql-committed-history-unconfirmed`では、履歴・実schema・元SQLを照合してから、担当者の確認下でPrisma履歴を復旧する。原SQLをもう一度流さない。

途中まで正常完了した場合も、次回はpendingが3件完全一致しなくなるため自動で続きを適用しない。今回の専用runnerは復旧・履歴強制更新機能を持たない。DB接続・role設定や適用済みmigrationファイルを変更して通過させない。

## 検証

`packages/database/scripts/test-native-release-psql.mjs`を使い捨てPostgreSQLへ実行する。実際の3 migration SQLとPrisma 6.19.3での履歴登録に加え、Preview、再実行、checksum、pending不一致、lock、statement timeout、履歴登録失敗、プロセス期限を確認する。接続先はテスト用DB名とlocalhost等の明示リストに限定する。Production用接続はテストに使わない。

参照：[Supabase session timeout](https://supabase.com/docs/guides/database/postgres/timeouts)、[Prisma 6の適用済み履歴の照合](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/patching-and-hotfixing)。
