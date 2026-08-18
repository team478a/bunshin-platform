# Phase 2 Slice 2.1-B Authenticated HTTP and UI Implementation Instruction

## Status

Approved for implementation. `docs/AUTH_SESSION_ADR.md`はAccepted。Production API/UIの公開はProduction Auth設定値とDNSが確認されるまで行わない。

## Objective

Slice 2.1-AのBunshin Core Persistenceへ、検証済みcurrent userをserver-sideで接続し、最小のProduction APIとmobile-first UIを公開する。

## In scope

- Supabase Auth Email Magic Link + PKCE adapter
- Supabase SSR cookie refresh
- `CurrentUserProvider` adapter
- 初回User/AuthIdentity/PERSONAL Workspace provisioning
- login、confirm、logout
- Bunshin create/list/get/update/archive Route Handler
- Bunshin一覧、作成Wizard、Summary/Edit UI
- Origin validation、no-store、error mapping
- Supabase Auth / Vercel WAF rate limit設定と運用文書
- unit、HTTP contract、PostgreSQL integration、browser smoke test

## Explicitly out of scope

- Knowledge、Memory、Capability assignment
- SOCIAL、AI、LINE、BLOG、Job
- password認証、Google OAuth、匿名認証、MFA
- Platform Admin override
- BrowserからSupabase Data APIへの直接table access
- Staging環境

## Required flow

```text
Email input
  -> Supabase Magic Link request
  -> HTTPS confirmation page
  -> token hash verification / PKCE session
  -> AuthIdentity lookup
  -> first-login transaction when absent
  -> CurrentUserProvider
  -> Workspace-scoped Bunshin use case
```

actorUserIdをrequest body、query、path、任意headerから受け取ってはならない。

## HTTP surface

```text
GET    /login
POST   /auth/email
GET    /auth/confirm
POST   /auth/logout

POST   /api/workspaces/:workspaceId/bunshins
GET    /api/workspaces/:workspaceId/bunshins
GET    /api/workspaces/:workspaceId/bunshins/:bunshinId
PATCH  /api/workspaces/:workspaceId/bunshins/:bunshinId
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/archive
```

## UI surface

- `/bunshins`: current Workspaceの一覧
- `/bunshins/new`: 5-step mobile-first Wizard
- `/bunshins/:bunshinId`: Summary / Edit

Wizard steps:

1. Name / Type
2. Objective
3. Audience
4. Personality / Face Policy
5. Summary / Create

Today、Mission、SOCIAL、Knowledge、Memory画面は作らない。

## Security requirements

- `CurrentUserProvider`はserver-onlyとする。
- server authorizationに`getSession()`だけを使用しない。
- active User/AuthIdentity/MembershipをDBで再確認する。
- authorization failureは`NOT_FOUND`、unauthenticatedは`UNAUTHORIZED`へ統一する。
- mutationはOrigin一致とJSON Content-Typeを要求する。
- auth token、cookie、email、Magic Link、Supabase response bodyをlogへ出さない。
- callback redirectはallowlist固定とする。
- login responseからaccount存在有無を推測できないようにする。
- PreviewへProduction Auth redirect URLやProduction DB credentialを接続しない。

## Test requirements

最低限、次を自動化する。

1. request supplied User IDを無視・拒否する
2. 改竄・期限切れ・失効sessionを拒否する
3. 初回provisioningがtransactionalである
4. 同じSupabase identityでUser/Workspaceを重複作成しない
5. suspended User/AuthIdentity/Membershipを拒否する
6. User AがUser BのWorkspace/Bunshinへアクセスできない
7. MEMBER/ADMIN/OWNER policyがSlice 2.1-Aと一致する
8. archive後のBunshinを通常API/UIに出さない
9. callbackのopen redirectを拒否する
10. Origin不一致、Content-Type不正、rate limit超過を拒否する
11. logout後にprotected routeへアクセスできない
12. auth/PII/secretがlogとerror responseへ出ない

## Production configuration gate

実装PRをReadyにする前に以下を確認する。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Supabase Auth Site URL
- callback Redirect URL allowlist
- Resend Free custom SMTPと認証専用送信domain認証
- Magic Link template
- JWT 1時間、session 30日、inactivity 7日
- Supabase Auth rate limits
- Vercel WAF login/API rules

値そのものをGitHub、docs、log、スクリーンショットへ記録しない。

## Completion gate

- ADRがAccepted
- auth adapterがprovider package内へ隔離されている
- Production APIのactorがverified sessionだけから解決される
- all security/integration/browser tests pass
- lint / typecheck / test / build / audit pass
- Vercel Previewはtest SupabaseまたはAuth無効設定を使用し、Production credentialを持たない
- implementation reportを作成
- human security review完了
