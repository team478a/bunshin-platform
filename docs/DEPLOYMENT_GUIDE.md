# Deployment Guide

## Vercel

| 項目            | 設定                                            |
| --------------- | ----------------------------------------------- |
| Root Directory  | `apps/web`                                      |
| Install Command | Vercelのpnpm workspace自動検出                  |
| Build Command   | `cd ../.. && pnpm turbo run build --filter=web` |
| Output          | Next.js default `.next`                         |
| Node.js         | 24.x                                            |
| Function Region | Tokyo `hnd1`                                    |

`apps/web/vercel.json`にもframework、build command、Function regionを定義している。Vercel ProjectのRoot Directoryが`apps/web`であるため、設定fileも同directoryへ置く。

## Environment Separation

- Production: `APP_ENV=production`、production Supabase project
- Preview/Staging: `APP_ENV=staging`、staging Supabase project
- Development: `APP_ENV=development`、local/development DB

Vercel Previewへproduction database URLやsecretを設定しない。環境変数はVercel UI/secure integrationで設定し、repositoryへcommitしない。

SOCIAL Intelligenceを有効にする場合は、Productionだけにserver-onlyの`OPENAI_API_KEY`を登録する。必要な場合は`OPENAI_STRATEGY_MODEL`、`OPENAI_WEEKLY_PLANNER_MODEL`、`OPENAI_DAILY_MISSION_PLANNER_MODEL`、`OPENAI_CONTENT_GENERATOR_MODEL`、`OPENAI_MISSION_QUALITY_MODEL`も登録する。Content GeneratorとQuality CheckerのProvider timeoutは45秒、Vercel生成Functionの上限は60秒とする。PreviewへProductionのOpenAI credentialを設定しない。詳細は`docs/STRATEGY_GENERATOR_REPORT.md`、`docs/PHASE4_SLICE_4_1_IMPLEMENTATION_REPORT.md`、`docs/PHASE4_SLICE_4_2_IMPLEMENTATION_REPORT.md`、`docs/PHASE4_INTELLIGENCE_COMPLETION_REPORT.md`を参照する。

## Deployment Order

1. CIのtypecheck/lint/test/buildが成功していることを確認する。
2. migrationがある場合はbackupと互換性を確認する。
3. 承認済み手順で対象環境へ`prisma migrate deploy`する。
4. Webをdeployする。
5. `/api/health/live`と`/api/health/ready`を確認する。

Phase 2完了時点でもworker/Cloud Runをdeployしない。SOCIAL、AI、LINE、BLOG、Job runtimeは後続Phaseの承認まで追加しない。

本番構成の選定理由、費用目安、アカウント作成前後のチェックリストは`docs/PRODUCTION_ENVIRONMENT_PLAN.md`を参照する。
