# Database Operation

## Connection Policy

- `DATABASE_URL`: Supabase pooler経由のapplication接続
- `DIRECT_URL`: direct connection。migrationと管理commandだけに使用
- Browser/Supabase clientからtableへ直接接続しない
- Platform DBと既存Blog DBを共有しない
- staging/productionは別Supabase projectにする

## Models through Phase 2

- `User`
- `AuthIdentity`
- `Workspace`
- `WorkspaceMembership`
- `PlatformAdmin`
- `Bunshin` / `BunshinObjective` / `BunshinAudience` / `BunshinPersonality`
- `OwnerKnowledge` / `BunshinKnowledgeGrant`
- `BunshinMemory`
- `BunshinCapabilityAssignment`

SOCIAL固有、BLOG固有、Mission、Content、Feedback、Job tableは存在しない。

## Migration

```bash
pnpm db:validate
pnpm db:migrate:dev
pnpm db:migrate:deploy
```

`migrate:dev`はlocal developmentだけで使用する。CIは空のtest DBへ`migrate deploy`して検証する。本番migrationはCIやVercel buildから自動適用せず、承認された変更windowで明示実行する。

## Production Migration Workflow

本番migrationは`.github/workflows/production-migrate.yml`をGitHub Actionsから手動実行する。

事前設定:

1. GitHub repositoryのSettingsからEnvironment `production`を作成する。
2. Environment protection rulesでrequired reviewerを1名以上設定する。
3. `production` Environment secretsへ`DATABASE_URL`と`DIRECT_URL`を登録する。
4. `DATABASE_URL`にはSupabase Shared Transaction Pooler（port 6543、`pgbouncer=true&connection_limit=1`）を使う。
5. `DIRECT_URL`にはSupabase Shared Session Pooler（port 5432）を使う。
6. branch protectionと通常CIが成功していることを確認する。

実行:

1. GitHub Actionsで`Production Database Migration`を選ぶ。
2. `Run workflow`のbranchが`main`であることを確認する。
3. confirmationへ`MIGRATE_PRODUCTION`と入力する。
4. Environment reviewerが対象commitとmigrationを確認して承認する。
5. `migrate status`、`migrate deploy`、再度の`migrate status`が成功したことを確認する。
6. Vercelの`/api/health/ready`とSupabase Table Editorを確認する。

Workflowは同時に1実行だけ許可し、進行中のproduction migrationを新しい実行でcancelしない。Secret値をlogへ出すcommandを追加してはいけない。

## Supabase Setup

1. Tokyo regionにproduction projectを作る。stagingは実運用開始まで作成せず、必要性が生じた時点で別projectとして追加する。
2. runtime用pooler URLを`DATABASE_URL`へ設定する。
3. direct URLを`DIRECT_URL`へ設定する。
4. Preview deploymentへproduction credentialを設定しない。
5. migration前にbackupとrollback方針を確認する。

## Backup and Restore

Supabaseの自動backup/PITRの契約・保持期間はproject ownerが管理する。Application teamはmigration前のbackup確認、restore rehearsal、schema/data compatibilityを担当する。復元操作は環境ownerの承認なしに実行しない。
