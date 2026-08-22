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

| 変数                                   | 公開        | 用途                               |
| -------------------------------------- | ----------- | ---------------------------------- |
| `APP_ENV`                              | server-only | deployment environment             |
| `APP_URL`                              | server-only | deployment base URL                |
| `DATABASE_URL`                         | secret      | pooled runtime connection          |
| `DIRECT_URL`                           | secret      | Prisma migration/direct connection |
| `SESSION_SECRET`                       | secret      | 将来のapplication session用        |
| `ENCRYPTION_KEY`                       | secret      | LINE Secret暗号化の環境別親鍵      |
| `LINE_CONFIG_KEY_VERSION`              | server-only | LINE暗号化鍵のrotation version     |
| `LINE_DEEP_LINK_KEY_VERSION`           | server-only | Mission Deep Link署名鍵version     |
| `LOG_LEVEL`                            | server-only | log threshold                      |
| `NEXT_PUBLIC_SUPABASE_URL`             | public      | Supabase Auth project URL          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public      | Supabase publishable key           |
| `OPENAI_API_KEY`                       | secret      | OpenAI server-side authentication  |
| `OPENAI_STRATEGY_MODEL`                | server-only | Account Strategy model             |
| `OPENAI_WEEKLY_PLANNER_MODEL`          | server-only | Weekly Planner model               |
| `OPENAI_DAILY_MISSION_PLANNER_MODEL`   | server-only | Daily Mission Planner model        |
| `OPENAI_CONTENT_GENERATOR_MODEL`       | server-only | Mission Content model              |
| `OPENAI_MISSION_QUALITY_MODEL`         | server-only | Mission Quality model              |

`NEXT_PUBLIC_*`には公開可能なSupabase URLとpublishable keyだけを設定する。service role key、DB credential、SMTP credentialは設定しない。server-only変数をClient Componentからimportしない。OpenAI keyはProductionだけへ設定し、PreviewへProduction DB credentialやProduction用AI keyを設定しない。`ENCRYPTION_KEY`は32文字以上の環境別の値とし、DB・管理画面・Previewへ置かない。Mission Deep Link署名には`ENCRYPTION_KEY`を直接渡さず、環境・用途・`LINE_DEEP_LINK_KEY_VERSION`を含むHKDF contextから専用HMAC鍵を導出する。

validation errorは不足した変数名だけを出し、値をlogへ出さない。
