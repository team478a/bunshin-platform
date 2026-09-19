# Deployment Guide

## Vercel

| 項目            | 設定                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| Root Directory  | `apps/web`                                                              |
| Install Command | Vercelのpnpm workspace自動検出                                          |
| Build Command   | `cd ../.. && pnpm db:assert-ready && pnpm turbo run build --filter=web` |
| Output          | Next.js default `.next`                                                 |
| Node.js         | 24.x                                                                    |
| Function Region | Tokyo `hnd1`                                                            |

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

SOCIAL Intelligenceを有効にする場合は、Productionだけにserver-onlyの`OPENAI_API_KEY`を登録する。必要な場合は`OPENAI_STRATEGY_MODEL`、`OPENAI_WEEKLY_PLANNER_MODEL`、`OPENAI_DAILY_MISSION_PLANNER_MODEL`、`OPENAI_CONTENT_GENERATOR_MODEL`、`OPENAI_MISSION_QUALITY_MODEL`も登録する。Content GeneratorとQuality CheckerのProvider timeoutは45秒、Vercel生成Functionの上限は60秒とする。PreviewへProductionのOpenAI credentialを設定しない。詳細は`docs/STRATEGY_GENERATOR_REPORT.md`、`docs/PHASE4_SLICE_4_1_IMPLEMENTATION_REPORT.md`、`docs/PHASE4_SLICE_4_2_IMPLEMENTATION_REPORT.md`、`docs/PHASE4_INTELLIGENCE_COMPLETION_REPORT.md`を参照する。

## Deployment Order

1. `main`でCIのtypecheck/lint/test/buildが成功していることを確認する。
2. migrationがある場合はbackupと互換性を確認する。
3. `main`から`production`へのPull Requestを作成し、公開差分を確認する。
4. 承認済み手順で対象環境へ`prisma migrate deploy`する。
5. Pull Requestを`production`へマージし、Vercel Production Deploymentを開始する。
6. `/api/health/live`と`/api/health/ready`を確認する。

Vercel buildは手順3の抜けを`db:assert-ready`で検出し、最新migrationが未適用なら公開前に停止する。`Production Health Smoke`は15分ごとにも実行し、正式ドメインのreadinessで`databaseSchema: current`を確認する。

Job状態・lease・retryはPostgreSQLを正本とし、Vercel CronはScheduler / Workerの短時間triggerとしてのみ使用する。独立Worker / Cloud RunとLINE Pushは後続Phaseの承認まで追加しない。

本番構成の選定理由、費用目安、アカウント作成前後のチェックリストは`docs/PRODUCTION_ENVIRONMENT_PLAN.md`を参照する。
