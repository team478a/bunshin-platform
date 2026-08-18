# Local Development

## Requirements

- Node.js 24 LTS
- pnpm 10.10.0（`packageManager`で固定）
- PostgreSQL 16以降、またはSupabase local development環境

## Setup

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:generate
pnpm db:migrate:dev
pnpm dev
```

Webは通常`http://localhost:3000`で起動する。`/api/health/live`はprocess、`/api/health/ready`は環境設定とDB接続を確認する。

## Validation

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Integration testはlocal/test専用DBへmigrationを適用してから実行する。URLに`localhost`、`127.0.0.1`または`test`が含まれず、`APP_ENV=production`の場合はtestを実行しない。

```bash
pnpm db:migrate:deploy
pnpm test:integration
```
