# ADR: Phase 2 Web Authentication and Session

- Status: Accepted
- Date: 2026-08-18
- Scope: Phase 2 Slice 2.1-B

## Context

Slice 2.1-AでBunshin Core Persistenceは本番反映済みだが、Productionには実ユーザーを確定するsessionがない。request body、query、path、任意headerのUser IDをactorとして信頼するとWorkspace境界を保証できないため、Production API/UIは未公開である。

Vercel ProとSupabase Proは契約済みであり、WebはNext.js 16、DB accessはserver-side Prismaを正本とする。LINE LoginはPhase 5であり、このADRには含めない。

## Decision

### Authentication provider

Web版の初期認証にはSupabase AuthのEmail Magic Linkを使用する。

- SSRはPKCE flowとする。
- `@supabase/ssr`と`@supabase/supabase-js`をauth adapter内へ隔離し、versionを固定する。
- Supabase Authのuser UUIDを`AuthIdentity(provider=EMAIL, providerUserId)`へ保存する。
- password認証、LINE Login、Google OAuth、匿名sign-inは実装しない。
- 初回ログイン時のみ、User、EMAIL AuthIdentity、PERSONAL Workspace、OWNER Membershipを1 transactionで作成する。
- callbackのredirect先はserver-side allowlistで固定し、任意URLを受け取らない。

### Session and current user

- Supabase Authのaccess tokenとrefresh tokenをSSR cookieで管理する。
- server-side auth判定には`getSession()`の値だけを使わず、Supabase Authへ照会する`getUser()`を使用する。
- `CurrentUserProvider` adapterは検証済みSupabase user UUIDからactive `AuthIdentity`とactive `User`を解決する。
- API/application use caseへ渡す`actorUserId`は、このadapterの結果だけから生成する。
- Platform Admin roleやWorkspace roleをJWT custom claimへ複製しない。認可は毎回Platform DBのactive Membershipを確認する。
- session refreshはNext.jsのserver-side request境界で行い、更新されたcookieをresponseへ反映する。

### Session policy

- Access token expiry: 1時間
- Time-boxed session: 30日
- Inactivity timeout: 7日
- Single session per user: 初期段階では無効
- logoutはSupabase `signOut()`をserver-sideで実行し、auth cookieを削除する。
- User/Identity/Membershipが停止または失効している場合、Supabase sessionが残っていてもapplication accessを拒否する。

上記のSupabase Pro設定はDashboardで明示的に設定し、実装レポートへ実値と確認日を残す。

### Cookie and CSRF policy

- Production cookieは`Secure`、`SameSite=Lax`、`Path=/`を必須とする。
- Supabase SSR libraryが管理するcookie名・分割方式へapplication codeを依存させない。
- state-changing requestはserver-sideで`Origin`が`APP_URL`と一致することを確認する。
- JSON APIは`Content-Type: application/json`を要求する。
- login callback以外のGETに副作用を持たせない。
- login、logout、mutationのresponseは`Cache-Control: no-store`とする。

### Rate limiting

二層で制限する。

1. Supabase AuthのEmail OTP/Magic Link送信制限を有効化し、同一宛先の再送間隔を60秒以上とする。
2. Vercel WAFで次をProductionへ設定する。
   - login送信endpoint: IP/JA4単位で10 request / 10分
   - `/api/workspaces/*/bunshins*`: IP/JA4単位で120 request / 1分

429 responseではemailの登録有無を区別しない。アプリケーションuser単位の分散rate limiterは利用規模を確認してから追加する。

### Email delivery

Supabaseの組み込みSMTPは本番利用しない。Resend Freeをcustom SMTP providerとして採用する。初期上限は月3,000通・1日100通で、認証メールだけに使用する。認証専用subdomain、SPF、DKIM、DMARC、送信元addressをProduction API/UI公開前に設定する。Magic Link templateはtoken hashをPlatformのHTTPS callbackへ渡し、link trackingを無効にする。

## Authorization boundary

Supabase Authは本人確認だけに使用する。Bunshin accessの正本は既存のPrisma repositoryによる次の条件である。

```text
requested workspaceId
ACTIVE Workspace
ACTIVE WorkspaceMembership for current User
status != ARCHIVED
OWNER / ADMIN / MEMBER ownership policy
```

Supabase Data APIをBrowserからBunshin tableへ接続しない。Platform Admin overrideも追加しない。

## Rejected alternatives

### Request supplied User ID

署名・session検証がなく、他Userを名乗れるため禁止する。

### Custom signed session only

既にSupabase Proを利用している状況でtoken rotation、失効、email verificationを再実装する必要があり、運用リスクが増えるため採用しない。

### LINE Login now

Phase 5のChannel体験と同時に設計すべきprovider固有機能であり、Slice 2.1-Bへ混在させない。

### Authorization in JWT claims

Membership変更がtoken expiryまで反映されず、DBとの二重管理になるため採用しない。

## Risks and mitigations

- `@supabase/ssr`はbeta: auth adapterへ隔離し、exact version pinとcontract testで更新影響を限定する。
- Magic Linkのmail scanner消費: Platform上の確認画面を挟む方式を採用し、custom SMTPのlink trackingを無効にする。
- Auth userとPlatform Userの不整合: 初回provisioningをtransaction化し、途中失敗を残さない。
- session cookie漏洩: cookie値・URL token・emailをlogへ出さず、error responseも認証失敗理由を統一する。

## Accepted values

- Supabase Auth Email Magic Link + PKCE
- Access token 1時間、session最大30日、inactivity 7日
- Resend Free custom SMTP
- login 10 request / 10分、Bunshin API 120 request / 1分
- `SameSite=Lax` cookie + Origin validation

Production Site URL、Redirect URL、認証専用送信domainの具体値はsecretではないが、DNS設定と同時に運用者が確定する。未設定のままProduction API/UIを公開しない。

## References

- Supabase Server-Side Rendering: https://supabase.com/docs/guides/auth/server-side
- Supabase Sessions: https://supabase.com/docs/guides/auth/sessions
- Supabase Passwordless Email: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase Auth Rate Limits: https://supabase.com/docs/guides/auth/rate-limits
- Supabase Custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Next.js Authentication Guide: https://nextjs.org/docs/app/guides/authentication
- Vercel WAF Rate Limiting: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Resend Pricing: https://resend.com/pricing
- Resend Supabase Integration: https://supabase.com/partners/integrations/resend
