# Phase 1 Implementation Report

## 実装概要

Phase 1「Platform Foundation」として、Node.js 24、pnpm 10、Turborepo、Next.js、Prisma/PostgreSQLを基盤とするmonorepoを構築した。User/Workspace/AuthIdentity/WorkspaceMembership/PlatformAdminの最小所有境界、transactionalなPersonal Workspace作成、environment validation、structured logging、API error、health check、CI、Vercel/Supabase運用文書を追加した。

Phase 2以降のBunshin、Memory、Owner Knowledge、SOCIAL、BLOG、LINE実接続、AI、Job queueは実装していない。

## 追加した構成

```text
apps/web
packages/platform-domain
packages/application
packages/capability-contract
packages/database
packages/auth
packages/config
packages/observability
packages/shared
```

rootには`pnpm-workspace.yaml`、`turbo.json`、共通TypeScript/ESLint/Prettier設定、Node/pnpm version固定、GitHub Actions、Vercel設定を追加した。

## 主要packageの責務

| Package               | 責務                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `platform-domain`     | User/Workspace/Membership/Platform Adminの型・role rule。framework非依存                 |
| `application`         | User+Personal Workspace作成、Workspace access、repository/transaction port、Job contract |
| `database`            | Prisma schema/migration、repository/transaction adapter、DB readiness                    |
| `auth`                | AuthProvider/CurrentUserProvider contract。LINE実装なし                                  |
| `config`              | server-only environment schemaと安全性検証                                               |
| `observability`       | structured log、context、redaction、request ID                                           |
| `shared`              | application error、API error mapping                                                     |
| `capability-contract` | 将来Capabilityの最小type/interface。実装なし                                             |
| `apps/web`            | Next.js UI shell、route groups、health page/API、security headers                        |

依存方向は`apps/web → application → platform-domain`を基本とし、databaseがapplication portを実装する。`platform-domain`はNext.js、React、Prisma、Supabase、Vercel、LINE、AI SDKへ依存しない。

## DB Model

Phase 1で作成したmodelは次の5つのみ。

- `User`
- `AuthIdentity`
- `Workspace`
- `WorkspaceMembership`
- `PlatformAdmin`

主な制約:

- `AuthIdentity(provider, providerUserId)` unique
- `WorkspaceMembership(workspaceId, userId)` unique
- `PlatformAdmin.userId` unique
- Workspace roleとPlatform roleは別enum/model
- foreign keyはowner entity削除時にCascade

## Migration内容

`20260818000000_platform_foundation`を追加した。上記5tableと8enum、index、unique constraint、foreign keyのみを作成する。既存Blog DBへの変更、Bunshin/Capability/Job tableは含まない。

一時PostgreSQL 16へ`prisma migrate deploy`し、migrationの適用成功を確認した。本番またはstaging Supabase projectへは接続・適用していない。

## 認証境界

`AuthProvider.verify()`と`CurrentUserProvider.getCurrentUser()`をcontractとして定義した。`AuthIdentity`にprovider固有identifierを分離し、User本体へLINE固有fieldを追加していない。LINE Login、session発行、Supabase Authは実装していない。

## 権限境界

- Workspace accessはactive Membershipをapplication/repository境界で要求する。
- Workspace更新はOWNERまたはADMIN Membershipを要求する。
- Workspace OwnerはPlatform Adminではない。
- Platform AdminはWorkspace Membershipを暗黙に取得しない。
- Platform Admin判定にemail hard-codeを使用しない。

## Environment管理

`APP_ENV`、`APP_URL`、`DATABASE_URL`、`DIRECT_URL`、`SESSION_SECRET`、`LOG_LEVEL`をZodで検証する。secret値をvalidation errorやlogへ出さない。`DATABASE_URL`はpooled runtime接続、`DIRECT_URL`はmigration/direct接続とした。

production/stagingは別Supabase projectとし、Previewへproduction credentialを渡さない方針を文書化した。

## CI

GitHub ActionsにNode.js 24/pnpm 10を使う2 jobを追加した。

- `verify`: frozen install、format、typecheck、lint、unit test、build
- `database`: PostgreSQL 16、schema validation、migration deploy、integration test

CIからproduction migrationを実行しない。

## Test結果

Node.js `v24.19.0`、pnpm `10.10.0`で実施。

- Unit test: 13件 PASS
- Integration test: 5件 PASS
  - User + PERSONAL Workspace + OWNER Membership
  - unique conflict時のtransaction rollback
  - Cross-Workspace read/update拒否
  - Workspace OwnerがPlatform Adminでないこと
  - Platform AdminがWorkspace Memberでないこと
- Prisma migration deploy: PASS（local temporary PostgreSQL 16）

## Build / Quality結果

| Command                          | Result            |
| -------------------------------- | ----------------- |
| `pnpm install --frozen-lockfile` | PASS              |
| `pnpm format:check`              | PASS              |
| `pnpm typecheck`                 | PASS              |
| `pnpm lint`                      | PASS              |
| `pnpm test`                      | PASS              |
| `pnpm build`                     | PASS              |
| `pnpm audit --audit-level high`  | PASS、既知脆弱性0 |
| `prisma validate`                | PASS              |

Next.js production buildは`/`、`/health`、`/api/health`、`/api/health/live`、`/api/health/ready`を生成した。

## Security

- `.env*`をignoreし、`.env.example`だけを許可
- server-only environment validation
- structured logのsecret/credential redaction
- API errorでinternal detailを非公開
- request ID/correlation contextの拡張点
- security headers
- production/test DB混同防止
- pooled/direct DB接続の分離
- dependency audit

## 既知の課題

- Supabase staging/production credential未提供のため、実Supabase接続は未確認。
- Vercel project未接続のため、実Preview/Production deployは未確認。
- readiness APIはDB接続を確認するが、接続timeout/詳細なdependency health policyは運用前に調整が必要。
- RLSはPhase 1で採用していない。application/repository scopeを正本とし、Phase 2で補助防御として再検討する。
- Prisma 6 CLIの間接依存に対するsecurity advisoryを避けるため`deepmerge-ts 8.0.1`をoverrideした。Prisma 7移行は別作業として評価する。
- ローカル既定Nodeは22だったため、Codex提供のNode 24 runtimeで検証した。

## Phase 2へ引き継ぐ事項

- Bunshin aggregateとObjective/Audience/Personalityのmodel設計
- Bunshin ownershipのWorkspace/User scope
- Owner Knowledge、Knowledge Grant default DENY
- Bunshin Memory isolation
- Bunshin Capability Assignmentとpermission
- Cross User/Cross Bunshin integration test
- Platform Admin overrideのaudit requirement
- Supabase RLS採用可否

## 未実装事項

意図的に実装していない項目:

- Bunshinと複数Bunshin UI
- Bunshin Memory / Owner Knowledge
- Capability assignmentおよびSOCIAL/BLOGの実体
- Daily Mission / SNS投稿生成 / AI
- LINE Login本格統合 / LINE Push
- WordPress / legacy data migration
- Job table / worker / polling / retry / cron
- Billing / Subscription / Referral
- pgvector

## Phase 1完了判定

ローカル受入検証とDraft PR #1のGitHub Actions（`verify`、`database`）は完了した。Draft PRの人間によるコード・設計レビューを確認するまでPhase 2を開始しない。Phase 2の準備事項は`docs/PHASE2_READINESS_PLAN.md`に整理する。
