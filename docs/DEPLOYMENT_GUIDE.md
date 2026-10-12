# Deployment Guide

## Vercel

| 項目            | 設定                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Root Directory  | `apps/web`                                                                                        |
| Install Command | Vercelのpnpm workspace自動検出                                                                    |
| Build Command   | `cd ../.. && pnpm db:migrate:vercel && pnpm db:assert-ready && pnpm turbo run build --filter=web` |
| Output          | Next.js default `.next`                                                                           |
| Node.js         | 24.x                                                                                              |
| Function Region | Tokyo `hnd1`                                                                                      |

`apps/web/vercel.json`にもframework、build command、Function regionを定義している。Vercel ProjectのRoot Directoryが`apps/web`であるため、設定fileも同directoryへ置く。

### Production branch

VercelのProduction Branchは`production`に設定する。`apps/web/vercel.json`は`production`だけGit連携デプロイを許可し、`main`、Pull Request、その他の作業ブランチからVercel Deploymentを作成しない。

通常の開発は作業ブランチから`main`へPull Requestをマージする。公開するときだけ、GitHub上で`main`から`production`へのPull Requestを作成し、差分とCIを確認してマージする。`production`へ直接pushせず、force pushもしない。

初回切替時は、Vercel Project SettingsのGit設定でもProduction Branchを`production`へ変更する。リポジトリ設定だけではVercel側のProduction Branch指定は変更されない。切替後、`main`への更新でDeploymentが作成されず、`production`へのマージでProduction Deploymentが1件作成されることを確認する。

## Environment Separation

- Production: `APP_ENV=production`、production Supabase project
- Preview/Staging: `APP_ENV=staging`、staging Supabase project
- Development: `APP_ENV=development`、local/development DB

Vercel Previewへproduction database URLやsecretを設定しない。環境変数はVercel UI/secure integrationで設定し、repositoryへcommitしない。

OEM月額利用料をStripe Checkoutで回収する場合は、ワタシワークス販売主体のStripeから`PLATFORM_BILLING_STRIPE_SECRET_KEY`と`PLATFORM_BILLING_STRIPE_WEBHOOK_SECRET`を設定する。各OEMがエンドユーザー向け商品を販売するStripe接続とは分離する。Webhook URLは`/api/payments/stripe/platform-billing/webhook`とし、`checkout.session.completed`と`checkout.session.expired`を登録する。Productionにはlive key、Development/Stagingにはtest keyだけを設定する。

Mission Automationを有効にするProductionには32文字以上の`CRON_SECRET`を登録する。Vercel Cronは毎分`/api/internal/jobs/schedule`と`/api/internal/jobs/run`をGETし、Vercelが付与する`Authorization: Bearer <CRON_SECRET>`をserver側で検証する。Cron時刻はUTC基準だが、対象判定は各BunshinのIANA timezoneとlocal notification timeを使用する。PreviewへProductionの`CRON_SECRET`を設定せず、手動実行時もsecretをURL、log、PRへ記録しない。

SOCIAL Intelligenceを有効にする場合、ProductionのOpenAI認証は暗号化DBのactive Provider設定を使用する。旧`OPENAI_API_KEY`環境変数はproduction Runtimeで使用されない。必要な場合は`OPENAI_STRATEGY_MODEL`、`OPENAI_WEEKLY_PLANNER_MODEL`、`OPENAI_DAILY_MISSION_PLANNER_MODEL`、`OPENAI_CONTENT_GENERATOR_MODEL`、`OPENAI_MISSION_QUALITY_MODEL`も登録する。Content GeneratorとQuality CheckerのProvider timeoutは45秒、Vercel生成Functionの上限は60秒とする。PreviewへProductionのOpenAI credentialを設定しない。詳細は`docs/STRATEGY_GENERATOR_REPORT.md`、`docs/PHASE4_SLICE_4_1_IMPLEMENTATION_REPORT.md`、`docs/PHASE4_SLICE_4_2_IMPLEMENTATION_REPORT.md`、`docs/PHASE4_INTELLIGENCE_COMPLETION_REPORT.md`を参照する。

## Deployment Order

### Migration接続だけの確認（Migration / Deployなし）

`pnpm db:migration:probe`は専用入口から同じPrisma CLI / Migration URL / timeout設定を使い、`BEGIN READ ONLY`内の設定検証だけで終了する。成功でも`migrate deploy`、schema変更、migration history更新、App buildへ進まない。通常のVercel build commandは変更しない。

実行前にcredential管理者が、承認された非公開実行環境へ既存Productionの`DATABASE_URL`、`DIRECT_URL`、必要なら`SUPABASE_SESSION_POOLER_HOST`を安全に注入する。画面のsecret表示、chatへの貼付、URLをcommand引数へ埋める、PreviewへのProduction secret複製、Gitへの保存はしない。credentialの取得・注入とこのPRのコード承認は別判断。

同じ実行環境で、値が秘密ではない次の2項目を設定して実行する（PowerShell例）:

```powershell
$env:VERCEL_ENV = 'production'
$env:MIGRATION_PROBE_EXPECTED_PROJECT_REF = '<承認済み20文字Supabase project ref>'
pnpm db:migration:probe
```

Node 24 / lockfileどおりのPrisma 6.19.3を使用する。probeの対象は`postgres` DB、`postgres` role（poolerでは`postgres.<project ref>`）へ限定し、両URLのproject一致、変換後session poolerのport 5432を接続前に検証する。別role / DB / transaction poolerを推測補正せず拒否する。timeout変数は実Vercelで使用する値と揃え、未設定時は下表の既定値を使う。

期待結果: exit 0と`MIGRATION_CONNECTION_PROBE_PASSED: no migrate deploy started.`。非0なら停止して原因を非公開環境で確認する。原エラー/URL/SQL/子process出力は表示しない。probe専用実行環境へのsecretアクセス手段がなければ、実接続はUNKNOWNのまま残し、通常buildを代用しない。

記録: 実行日時、実行者、code SHA、承認project ref、Prisma版、timeout値、exit / 固定reason、実行環境。ローカルprobe成功はVercel build hostからの到達性証明ではなく、probeとMigrationも別session。backup / pending / checksum / RLS / writer drain / OEM準備 / Migration・Deploy承認の代わりにしない。probeを実行するために本番サービスを停止する必要はない。

### Migration実行上限（公開前レビュー必須）

`db:migrate:vercel`はproductionだけで、DBセッション設定の非永続probe → `prisma migrate deploy`を実行する。Prisma CLIを直接起動し、DB側の上限と両コマンド合計のprocess期限を分離する。

| 環境変数                         | 未設定時  | 許容最大  |
| -------------------------------- | --------- | --------- |
| `MIGRATION_LOCK_TIMEOUT_MS`      | 5000 ms   | 10000 ms  |
| `MIGRATION_STATEMENT_TIMEOUT_MS` | 60000 ms  | 120000 ms |
| `MIGRATION_PROCESS_TIMEOUT_MS`   | 300000 ms | 600000 ms |

正の整数のみ。`lock < statement < process`を必須とし、0（無期限）、不正値、最大超過は接続前に拒否する。DBの`idle_in_transaction_session_timeout`はstatementと同値、接続待ちは10秒。対象migrationの実測時間に対して値を人間レビューする。これは本番設定を変更する承認ではない。

上限はMigration専用子processのURL startup `options`で渡す。アプリの環境・DB全体/role設定・schema/migration SQLは変更しない。既存URLに`options`があれば競合を推測解決せず拒否する。子processだけ`DATABASE_URL`と`DIRECT_URL`を同一Migration接続へ固定し、`PGOPTIONS`を除去する。poolerへの既存変換は維持するが、実poolerのstartup設定対応は本番操作前に確認する。設定probeが失敗した場合、migrate deployは開始しない。

期限到達時はLinuxで所有するCLI/engineのprocess groupへSIGKILLを送る。WindowsではCLIだけの停止であり、engine子孫の終了は保証しない。いずれも**DB session/SQLの終了・rollback・全writer drainは証明しない**。非0終了・signal・期限切れ・起動失敗はbuildを停止し、自動retry/resolve/rollbackしない。先行migrationや同migrationの先行statementが適用済みである可能性を残す。

エラー後は次の順で人間が確認する:

1. 新deploy/retryを止め、対象操作の停止を維持する。既存Appの互換状態を確認する。
2. 承認済みread-only手段で`application_name = 'bunshin_migration_bounded'`のsession/lockと、`_prisma_migrations`のfinished/rolled_back/checksum、実schemaを照合する。SQL本文・secret・個人データはログへ出さない。session名だけで全writer停止と判断しない。
3. 失敗migrationの先行statementも含め適用済み範囲を確定し、復旧担当がforward repair/restore等をレビューする。終了不明のまま再送、成功偽装のresolve、table/history削除はしない。
4. 人間による復旧・再実行承認後に進める。原エラーやSQLを表示しない固定reasonログは診断の代わりではなく、DB状態確認が必要。

このrunnerは引き続き全pendingを対象とする。allowlist、backup、drain、OEM履歴/cutover、Pilot enableの承認は自動化しない。`db:migrate:deploy`の直接実行には本runnerの上限は付かない。

根拠: `packages/database/scripts/deploy-migrations-for-vercel.mjs`、`migration-process.mjs`、`test/vercel-production-migrations.test.ts`、`test/migration-bounds.integration-cases.ts`。[Prisma v6 startup options](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql)、[PostgreSQL 17 timeout semantics](https://www.postgresql.org/docs/17/runtime-config-client.html)。設定probeとmigrationは別sessionだが同じCLI/URL/startup設定を使う。migration SQLが自らtimeoutを変更する場合まで防ぐ仕組みではない。

OEM Registration Billing V2を含むリリースは[本番Migration安全監査](OEM_REGISTRATION_BILLING_V2_MIGRATION_SAFETY_AUDIT.md)の復元検証、実DBの全pending/既存データ適合、lock、旧Application互換Gateを先に満たす。Production buildは全pending Migrationを公開前に実行するため、Deployだけを先行しない。schema配備、初期履歴準備、料金公開/cutover、請求開始は別承認とする。

Personal Learningの限定運用は[Production Closed Pilot Runbook](ai-training/PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT_RUNBOOK.md)を参照する。stagingは任意確認環境であり、Production Release Gateと人間承認を省略する理由ではない。現コードの本番拒否と少人数制限は別PRまで維持し、本番配備・利用開始・Provider利用を分離する。

Personal Learning P1-C-S migration `20261006021000_personal_learning_persistence`を含むリリースは、[承認条件と手順](ai-training/AI_TRAINING_PERSONAL_LEARNING_P1CS_RELEASE_RUNBOOK.md)でBackup、実DBのpending一覧、旧V1との互換性、既存Goal indexのlock影響を確認する。保存基盤の配備、Definitionの人間承認、利用開始は別判断とし、review fixtureを自動承認しない。

Feedback maintenance migration `20261003050000_feedback_maintenance_job`を含むリリースは、[専用Runbook](improvement/IMPROVEMENT_MAINTENANCE_RELEASE_RUNBOOK.md)の停止/drain/preflightをbuild開始前に満たす。build先頭でDBが変わり、旧アプリのworkerが動いている状態は非互換。jobs/scheduleだけ止めてもjobs/runのcleanupは止まらない。停止を証明できない場合は公開を開始しない。

1. `main`でCIのtypecheck/lint/test/buildが成功していることを確認する。
2. migrationがある場合はbackupと互換性を確認する。
3. `main`から`production`へのPull Requestを作成し、公開差分を確認する。
4. Pull Requestを`production`へマージし、Vercel Production Deploymentを開始する。
5. Production build先頭の`db:migrate:vercel`と、直後の`db:assert-ready`が成功したことを確認する。
6. Web build完了後、`/api/health/live`と`/api/health/ready`を確認する。

Vercel Production buildは最新migrationを適用し、`db:assert-ready`で適用結果を検証する。どちらかが失敗した場合は新しいApplicationを公開しない。Preview / Developmentではmigrationを適用しない。`Production Health Smoke`は15分ごとにも実行し、正式ドメインのreadinessで`databaseSchema: current`を確認する。

Job状態・lease・retryはPostgreSQLを正本とし、Vercel CronはScheduler / Workerの短時間triggerとしてのみ使用する。独立Worker / Cloud RunとLINE Pushは後続Phaseの承認まで追加しない。

本番構成の選定理由、費用目安、アカウント作成前後のチェックリストは`docs/PRODUCTION_ENVIRONMENT_PLAN.md`を参照する。
