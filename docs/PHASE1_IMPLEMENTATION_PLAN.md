# Phase 1 Implementation Plan

## Scope

Phase 1ではPlatform Foundationだけを構築する。Bunshin、Memory、Owner Knowledge、SOCIAL、BLOG、LINE実接続、AI、Job queue、Billingは実装しない。

## Confirmed Decisions

- Next.js Route Handlerから開始し、domain/applicationをframework非依存にする
- pnpm 10 + Turborepo、Node.js 24 LTSを固定する
- PostgreSQL/Supabaseをserver-side Prismaから利用し、Platform DBと旧Blog DBを分離する
- production/stagingは別Supabase projectとする
- User作成時にPERSONAL WorkspaceとOWNER Membershipをtransactionで作成する
- Workspace roleとPlatform Admin roleを別modelにする
- Vercelへ`apps/web`をdeploy可能にする
- Jobはcontractだけを定義し、table/worker/retry/schedulerを作らない
- 既存Blogは変更・移動せず、Phase 9のStrangler/ACL移行まで分離する

## Implementation Steps

1. Root workspace、Node/pnpm固定、Turborepo、共通TypeScript/ESLint/Prettierを設定する。
2. `apps/web`に最小Next.jsアプリ、public/app/admin route groups、health endpointsを作る。
3. `platform-domain`にUser/Workspace/Membership/PlatformAdminの型・enum・純粋ruleを作る。
4. `application`にrepository/transaction port、所有権確認、User+Personal Workspace作成use case、Job contractを作る。
5. `database`にPrisma schema、初期migration、repository/transaction adapter、readiness probeを作る。
6. `auth`に`AuthProvider`と`CurrentUserProvider`の境界だけを定義する。
7. `config`にserver/client environment validationとproduction/test safety checkを作る。
8. `observability`にsecret redaction、structured logger、request/correlation contextを作る。
9. `shared`にapplication errorとHTTP非依存のerror codeを作る。
10. Unit testとlocal PostgreSQL integration testを分け、Workspace/Admin境界を検証する。
11. GitHub Actionsでinstall/typecheck/lint/test/buildとintegration testを実行する。
12. local development、environment、database、Vercel/Supabase deployment、Phase 1 reportを文書化する。

## Dependency Direction

```text
apps/web → application → platform-domain
apps/web → database/config/observability/shared
database → application + platform-domain
auth → platform-domain
capability-contract → no platform implementation
```

`platform-domain`からNext.js、React、Prisma、Supabase、Vercel、LINE、AI SDK、Node.js APIへ依存しない。

## Database Models

Phase 1で作成するmodelは次だけとする。

- User
- AuthIdentity
- Workspace
- WorkspaceMembership
- PlatformAdmin

主な制約:

- `AuthIdentity(provider, providerUserId)` unique
- `WorkspaceMembership(workspaceId, userId)` unique
- PlatformAdminはUserと1:1、Workspace Membershipとは独立
- User/Workspace作成はtransaction portを通す

## Validation

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit
```

Integration testはproduction/staging URLを拒否し、明示されたtest databaseだけへ接続する。

## Risks and Mitigations

| Risk                         | Mitigation                                                             |
| ---------------------------- | ---------------------------------------------------------------------- |
| Supabase credential未提供    | schema/migrationを作成し、local PostgreSQLで検証可能にする             |
| ローカルNodeが24でない       | repository/CI/Vercelを24固定し、可能な検証は互換Nodeで行い差を報告する |
| Next.jsへのdomain漏出        | workspace package依存とdomain packageのdependency testで検知する       |
| tenant条件漏れ               | application repository portをactor-scopedにし、cross-user testを置く   |
| AdminとWorkspace Ownerの混同 | 別model/別repository queryと境界testで保証する                         |
| migrationの本番誤適用        | CI/文書では検証のみとし、自動production migrationを作らない            |

## Completion Gate

- Phase 1受入基準のRepository/Web/Domain/Database/Security/Qualityを満たす
- Phase 1禁止modelと機能が存在しない
- 全検証結果と未確認事項を`PHASE1_IMPLEMENTATION_REPORT.md`へ記録する
- Draft PRを作成し、Phase 2を開始せず停止する
