# Deployment Guide

## Vercel

| 項目            | 設定                                |
| --------------- | ----------------------------------- |
| Root Directory  | repository root                     |
| Install Command | `pnpm install --frozen-lockfile`    |
| Build Command   | `pnpm turbo run build --filter=web` |
| Output          | Next.js default `.next`             |
| Node.js         | 24.x                                |
| Function Region | Tokyo `hnd1`                        |

`vercel.json`にもinstall/build commandを定義している。

## Environment Separation

- Production: `APP_ENV=production`、production Supabase project
- Preview/Staging: `APP_ENV=staging`、staging Supabase project
- Development: `APP_ENV=development`、local/development DB

Vercel Previewへproduction database URLやsecretを設定しない。環境変数はVercel UI/secure integrationで設定し、repositoryへcommitしない。

## Deployment Order

1. CIのtypecheck/lint/test/buildが成功していることを確認する。
2. migrationがある場合はbackupと互換性を確認する。
3. 承認済み手順で対象環境へ`prisma migrate deploy`する。
4. Webをdeployする。
5. `/api/health/live`と`/api/health/ready`を確認する。

Phase 1ではworker/Cloud Runをdeployしない。

本番構成の選定理由、費用目安、アカウント作成前後のチェックリストは`docs/PRODUCTION_ENVIRONMENT_PLAN.md`を参照する。
