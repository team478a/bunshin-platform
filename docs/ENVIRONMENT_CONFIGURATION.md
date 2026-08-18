# Environment Configuration

## Environments

| APP_ENV       | 用途                           | DB                          |
| ------------- | ------------------------------ | --------------------------- |
| `development` | local/test/preview development | localまたはdevelopment専用  |
| `staging`     | 実運用開始前の受入確認         | 将来追加するstaging専用DB   |
| `production`  | production                     | production Supabase project |

stagingとproductionで同じSupabase project、URL、secretを使用しない。

実運用開始まではstaging専用Supabaseを作成しない。Vercel Previewへproduction DB credentialを設定せず、DBが必要な検証はlocal PostgreSQLまたはGitHub Actionsの一時PostgreSQLで行う。実ユーザー受入前、またはproduction相当環境でmigration・認証・外部連携を検証する必要が生じた時点でstagingを追加する。

## Variables

| 変数             | 公開        | 用途                               |
| ---------------- | ----------- | ---------------------------------- |
| `APP_ENV`        | server-only | deployment environment             |
| `APP_URL`        | server-only | deployment base URL                |
| `DATABASE_URL`   | secret      | pooled runtime connection          |
| `DIRECT_URL`     | secret      | Prisma migration/direct connection |
| `SESSION_SECRET` | secret      | 将来のapplication session用        |
| `LOG_LEVEL`      | server-only | log threshold                      |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase Auth project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase publishable key |

`NEXT_PUBLIC_*`には公開可能なSupabase URLとpublishable keyだけを設定する。service role key、DB credential、SMTP credentialは設定しない。server-only変数をClient Componentからimportしない。LINE、AI、cron等の未使用secretは追加していない。

validation errorは不足した変数名だけを出し、値をlogへ出さない。
