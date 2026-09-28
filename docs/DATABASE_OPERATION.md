# Database Operation

## Connection Policy

- `DATABASE_URL`: Supabase pooler経由のapplication接続
- `DIRECT_URL`: direct connection。migrationと管理commandだけに使用
- Browser/Supabase clientからtableへ直接接続しない
- Platform DBと既存Blog DBを共有しない
- staging/productionは別Supabase projectにする

## Current Data Domains

2026-09-28時点のschemaは、初期Platform Foundationに加えて次の主要領域を含む。正確なmodel、relation、index、制約は `packages/database/prisma/schema.prisma` とmigrationを正本とし、この一覧からschemaを推測しない。

- Identity / Workspace / Membership / Platform Administration
- Bunshin / Objective / Audience / Personality / Knowledge Grant / Memory / Capability Assignment
- SOCIAL Profile / Strategy / Content Pillar / Weekly Plan / Daily Mission / Decision / Activity / Post / Feedback
- LINE configuration / connection / notification / retry / audit
- Image / Video project / asset / render / usage
- Service / Service Role / Campaign / Product Pack / Tracking Link / Onboarding
- Program / Enrollment / Participant Goal / AI Training
- Point / Badge / Reward / Credit / Entitlement
- Contract / Product / Price / Order / Payment / Invoice / Collection / Refund / Dispute
- Provider configuration / Job / Usage / Cost / Audit / Production Gate evidence

既存BLOGは別DB・別境界として維持する。Platform DBへ暗黙に統合せず、移行する場合は専用計画、mapping、rollback、分離テストを用意する。

## Migration

```bash
pnpm db:validate
pnpm db:migrate:dev
pnpm db:migrate:deploy
```

`migrate:dev`はlocal developmentだけで使用する。CIは空のtest DBへVercel Productionと同じwrapper経由で`migrate deploy`を実行し、その後にschema readinessとintegration testを検証する。

VercelのProduction buildは、`pnpm db:migrate:vercel`、`pnpm db:assert-ready`、Web buildの順に実行する。Production以外ではwrapperがmigrationをskipし、Productionでは`DATABASE_URL`または`DIRECT_URL`が欠けていれば停止する。MigrationまたはSchema Gateが失敗した場合はbuildを失敗させ、新しいApplicationを公開しない。

## Production Release Migration Workflow

本番migrationは、承認済みの`main`を`production` branchへ反映するVercel Production releaseのbuild先頭で実行する。旧`.github/workflows/production-migrate.yml`は、GitHub側の古いDB SecretとVercel側の有効な接続情報が分離していたため、2026-09-07に廃止した。背景と障害再発防止策は`PRODUCTION_SCHEMA_SAFETY_REPORT.md`を参照する。

事前設定:

1. Vercel Productionに`DATABASE_URL`、`DIRECT_URL`、必要なら`SUPABASE_SESSION_POOLER_HOST`をserver-onlyで登録する。
2. `DATABASE_URL`にはSupabase Shared Transaction Poolerを使う。
3. `DIRECT_URL`にはmigration可能なdirectまたはsession接続を使う。Direct hostを使う場合、wrapperはProduction build中だけIPv4 session poolerへ変換する。
4. `main`のrequired CI `verify` / `database`が成功していることを確認する。
5. migrationの前方互換性、backup、rollbackまたはforward-fix方針を確認する。
6. `production` branchへの直接pushを禁止し、release PRをレビューする。

実行:

1. `main`から`production`へのrelease PRを作り、対象commit、CI、migration、backup方針を確認する。
2. release PRを承認して`production`へmergeする。
3. Vercel Production Deploymentで`db:migrate:vercel`、`db:assert-ready`、Web buildが順に成功したことを確認する。
4. `/api/health/live`と`/api/health/ready`を確認する。
5. GitHubの`Production Health Smoke`が対象release後に成功したことを記録する。

`/api/health/ready`はDBへの接続だけでなく、Applicationが要求する最新migrationも確認する。`databaseSchema: current`がない、またはHTTP 503の場合は、画面確認へ進まずmigration状態を調べる。

DB password変更時はVercel Productionの`DATABASE_URL`と`DIRECT_URL`を同時更新する。片方だけを更新しない。旧GitHub Environmentに同名Secretが残っていても、現行release経路の正本として扱わない。

Secret値をbuild log、GitHub Actions log、PR、運用文書へ出すcommandを追加してはいけない。

## Supabase Setup

1. Tokyo regionにproduction projectを作る。stagingは実運用開始まで作成せず、必要性が生じた時点で別projectとして追加する。
2. runtime用pooler URLを`DATABASE_URL`へ設定する。
3. direct URLを`DIRECT_URL`へ設定する。
4. Preview deploymentへproduction credentialを設定しない。
5. migration前にbackupとrollback方針を確認する。

## Backup and Restore

Supabaseの自動backup/PITRの契約・保持期間はproject ownerが管理する。Application teamはmigration前のbackup確認、restore rehearsal、schema/data compatibilityを担当する。復元操作は環境ownerの承認なしに実行しない。
