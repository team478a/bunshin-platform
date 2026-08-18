# Environment Configuration

## Environments

| APP_ENV       | 用途                           | DB                          |
| ------------- | ------------------------------ | --------------------------- |
| `development` | local/test/preview development | localまたはdevelopment専用  |
| `staging`     | Vercel Preview/staging         | staging Supabase project    |
| `production`  | production                     | production Supabase project |

stagingとproductionで同じSupabase project、URL、secretを使用しない。

## Variables

| 変数             | 公開        | 用途                               |
| ---------------- | ----------- | ---------------------------------- |
| `APP_ENV`        | server-only | deployment environment             |
| `APP_URL`        | server-only | deployment base URL                |
| `DATABASE_URL`   | secret      | pooled runtime connection          |
| `DIRECT_URL`     | secret      | Prisma migration/direct connection |
| `SESSION_SECRET` | secret      | 将来のapplication session用        |
| `LOG_LEVEL`      | server-only | log threshold                      |

Phase 1には`NEXT_PUBLIC_*`変数がない。server-only変数をClient Componentからimportしない。LINE、AI、cron等の未使用secretは追加していない。

validation errorは不足した変数名だけを出し、値をlogへ出さない。
