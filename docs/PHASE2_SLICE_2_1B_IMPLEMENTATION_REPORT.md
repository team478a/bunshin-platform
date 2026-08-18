# Phase 2 Slice 2.1-B Implementation Report

## Status

Implementation complete; Production configuration and human security review remain release gates.

## Implemented

- Supabase Auth Email OTP / Magic Link request、token-hash confirmation、logout
- `getUser()`で検証したidentityだけを受け取る`CurrentUserProvider`
- 初回ログイン時のUser、EMAIL AuthIdentity、PERSONAL Workspace、OWNER Membership一括作成
- Bunshin create/list/get/update/archive Route Handler
- mutationのsame-originおよびJSON Content-Type検証
- `no-store` responseと共通公開エラー変換
- Bunshin一覧、5-step作成Wizard、Summary/Edit、archive UI
- Supabase公開設定値の`.env.example`追加
- current-user provider unit tests

request body、query、path、任意headerから`actorUserId`は受け取らない。API actorはverified sessionから解決し、既存のWorkspace Membership policyを再利用する。

## Explicitly not implemented

Knowledge、Memory、Capability assignment、SOCIAL、AI、LINE、BLOG、Job、password認証、OAuth、MFA、Platform Admin override、Stagingは実装していない。

## Verification

- lint: passed
- typecheck: passed
- unit test suite: passed
- Next.js production build: passed with non-secret placeholder configuration

## Production release gates

- Vercel Productionへ`NEXT_PUBLIC_SUPABASE_URL`と`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`を設定
- Supabase Site URLおよびredirect allowlistをproduction URLへ限定
- Resend custom SMTPと認証専用domainのSPF/DKIM/DMARCを確認
- JWT 1時間、session最大30日、inactivity 7日を確認
- Supabase Auth rate limitおよびVercel WAF ruleを設定
- Production credentialをPreviewへ設定していないことを確認
- Production PostgreSQL integration test、browser smoke test、human security reviewを実施

上記release gateが完了するまで、実装PRはDraftのままとしProduction公開しない。
