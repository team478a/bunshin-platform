# Phase 6-B LINE Auth Session Spike

日付: 2026-08-22

## 結論

LINE Loginは、Supabase AuthのCustom OIDC Providerを経由して既存のSupabase SSR sessionへ収束させる。
LINE OAuthをBUNSHINが直接処理して独自sessionを発行する方式は採用しない。

この方式では、Supabase AuthがLINEとのAuthorization Code Flow、PKCE S256、nonce、ID token検証、session発行を担当する。BUNSHINはSupabaseが検証したsessionを`getUser()`で再検証し、Platform DBの`AuthIdentity`、Active User、Workspace Membershipへ収束させる。

## 公式仕様で確認したこと

- Supabase Custom OAuth/OIDC Providerは、任意の標準準拠OIDC ProviderをSupabase sessionへ統合できる。
- Custom ProviderではPKCEが既定で有効であり、nonceとID token署名検証もSupabase Authが担当する。
- LINE Login v2.1はOAuth 2.0 Authorization Code FlowとOpenID Connectをサポートし、PKCE S256を利用できる。
- Supabaseの手動Identity Linkingは既存verified sessionから開始できる。ただし機能はBetaであり、Production採用前に実環境smokeを必須とする。

## Callback URLの訂正

PR #61/#62で`Callback URL`を`APP_URL/auth/line/callback`としていたが、Custom OIDC Providerを採用する場合、LINE Developers Consoleへ登録するCallback URLは次になる。

`{NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`

`{APP_URL}/auth/line/callback`はSupabase Authが認証完了後に戻すApplication Redirect URLであり、LINE Provider Callbackとは別物である。

両URLを混同しない。

- Provider Callback URL: Supabase project URLからサーバー側で生成。LINE Developers Consoleへ登録する。
- Application Callback URL: `APP_URL`から生成。Supabase Redirect URL Allowlistへ登録する。
- いずれも管理画面から自由入力させない。
- ProductionではProductionのSupabase project URLとAPP_URLだけを許可する。

## Provider設定

- identifier: `custom:line`
- provider type: OIDCを第一候補とし、LINE discovery metadataの実環境登録が成功しない場合だけOAuth2 manual configurationを使う。
- scopes: `openid profile`。初期MVPでは`email`を要求しない。
- `email_optional`: true
- `pkce_enabled`: trueから変更しない。
- `skip_nonce_check`: falseから変更しない。
- LINE Channel ID / Secretは環境別Supabase Auth Provider設定にも登録する。

メールscopeを初期MVPで要求しないのは、LINE emailと既存Email Userの一致による自動account mergeを避けるためである。メール一致を所有権証明として扱わない。

## SessionとPlatform Identity

1. Supabase AuthがCustom LINE Identityを検証してSSR sessionを発行する。
2. BUNSHIN callbackはSupabase authorization codeをsessionへ交換する。
3. `getUser()`でsessionをサーバー再検証する。
4. Supabase Userのidentity metadataから`custom:line`のprovider subjectを取得する。
5. Platform DBの`AuthIdentity(provider=LINE, providerUserId=subject)`を解決する。
6. 既存Email sessionから明示連携した場合のみ、同じPlatform UserへLINE Identityを追加する。
7. 未ログインの初回LINE Loginは新規UserとPERSONAL Workspaceを作成する。
8. 同じLINE subjectが別Platform Userに存在する場合は競合として拒否する。

Supabase User IDをLINE user IDとして保存しない。LINE subject、Supabase Auth User ID、Platform User IDは別識別子として扱う。

## Account Linking

- 既存Userへの追加は、既存verified sessionから`linkIdentity()`を開始した場合だけ許可する。
- callbackではlink transactionのsingle-use stateと、callback時のverified Supabase Userを照合する。
- email一致によるBUNSHIN側の自動統合は禁止する。
- Supabase automatic linkingの影響を避けるため、LINEへemail scopeを要求しない。
- unlinkは最後のログイン手段を削除しない。Platform IdentityとSupabase Identityの双方が成功した場合だけ完了扱いにする。

## 環境分離

- DEVELOPMENT、STAGING、PRODUCTIONでSupabase project、Custom Provider、LINE Login Channelを分離する。
- runtime `APP_ENV`とLINE設定environmentの一致を必須とする。
- Production Custom ProviderをPreview/Stagingから使わない。
- Provider Callback hostは現在の`NEXT_PUBLIC_SUPABASE_URL` hostと完全一致させる。
- Application Callbackは現在の`APP_URL` originと固定pathから生成する。

## Spikeで実装しないもの

- LINE Login本番導線
- User自動作成
- Identity link/unlink
- Mission Deep Link復帰
- Webhook
- Messaging、通知、Job

## 6-B実装前の外部設定Gate

1. 環境別Supabase projectでCustom Provider `custom:line`を作成する。
2. LINE Developers ConsoleへProvider Callback URLを登録する。
3. Supabase Redirect URL AllowlistへApplication Callback URLを登録する。
4. Supabase manual identity linkingを有効化する。
5. DEVELOPMENTで新規Login、既存User明示連携、競合、解除のsmokeを行う。

この外部設定と人間レビューが完了するまで、6-BのLogin本実装へ進まない。
