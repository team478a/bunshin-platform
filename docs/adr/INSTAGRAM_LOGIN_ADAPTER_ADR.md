# Instagram Login公式OAuth Adapter ADR

日付: 2026-11-04
状態: PR-1B2 proposed

## Context

PR-1B1は、SNS資格情報の所有権・Bunshin Grant・暗号化保存をProvider非依存のCoreとして追加した。次の境界は、MetaのInstagram API with Instagram Loginが発行する認可codeを公式手順で長期tokenへ交換し、Instagram professional accountを確認するProvider Adapterである。OAuth callback、stateの永続化・single-use消費、会員認可、Coreへの保存、画面はPR-1B3で扱う。

Meta公式資料では、認可codeを`POST https://api.instagram.com/oauth/access_token`で短期tokenへ交換し、そのtokenを`GET https://graph.instagram.com/access_token`の`ig_exchange_token` grantで長期tokenへ交換する。有効な長期tokenは発行から24時間経過後、`GET https://graph.instagram.com/refresh_access_token`の`ig_refresh_token` grantで60日間更新できる。初期scopeは`instagram_business_basic`と`instagram_business_content_publish`とする。

- [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Instagram API with Instagram Login: Get Started](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started)
- [Content Publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing)

## Decision

- Provider依存の実装は`apps/web/src/providers/instagram-login.ts`へ隔離する。
- 認可先、code交換先、長期token交換・更新先はMetaの固定originのみを使用する。
- 認可URLは呼出側が作成した32文字以上のstateを必須とし、初期scopeを固定する。stateの発行・保存・照合・single-use消費はPR-1B3のOAuth transaction責務とする。
- code交換は自動再試行しない。通信結果が不明なままsingle-use codeを再送しない。
- 短期token応答の`user_id`とpermission、長期token応答、`/me`の`user_id`とusernameを厳格に検証する。必要scope不足やaccount不一致は保存へ進めない。
- Providerのerror本文を例外、API応答、ログへ転記せず、固定category、retryable、HTTP statusだけへ分類する。
- App ID、App Secret、redirect URI、Graph API versionはserver-only環境変数として4件一組で検証する。redirect URIはHTTPSを必須とし、developmentのlocalhostだけHTTPを許す。
- Adapterはtokenを内部結果として返すが保存しない。PR-1B3の認可済みcallback use caseだけがPR-1B1の暗号化保存へ渡せる。

## Consequences

Meta固有のendpoint・response形式・error分類をCoreから分離したまま、認可codeから保存可能な長期資格情報までを検証できる。実OAuth接続はまだ公開されず、state transaction、callback route、接続・解除・再接続UIが完成するまで利用者は接続できない。
