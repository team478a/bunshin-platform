# Database Operation

## Connection Policy

- `DATABASE_URL`: Supabase pooler経由のapplication接続
- `DIRECT_URL`: direct connection。migrationと管理commandだけに使用
- Browser/Supabase clientからtableへ直接接続しない
- Platform DBと既存Blog DBを共有しない
- staging/productionは別Supabase projectにする

## Models in Phase 1

- `User`
- `AuthIdentity`
- `Workspace`
- `WorkspaceMembership`
- `PlatformAdmin`

Bunshin、Memory、Capability assignment、SOCIAL、BLOG、Job tableは存在しない。

## Migration

```bash
pnpm db:validate
pnpm db:migrate:dev
pnpm db:migrate:deploy
```

`migrate:dev`はlocal developmentだけで使用する。CIは空のtest DBへ`migrate deploy`して検証する。本番migrationはCIやVercel buildから自動適用せず、承認された変更windowで明示実行する。

## Supabase Setup

1. Tokyo regionにstagingとproductionを別projectで作る。
2. runtime用pooler URLを`DATABASE_URL`へ設定する。
3. direct URLを`DIRECT_URL`へ設定する。
4. Preview deploymentへproduction credentialを設定しない。
5. migration前にbackupとrollback方針を確認する。

## Backup and Restore

Supabaseの自動backup/PITRの契約・保持期間はproject ownerが管理する。Application teamはmigration前のbackup確認、restore rehearsal、schema/data compatibilityを担当する。復元操作は環境ownerの承認なしに実行しない。
