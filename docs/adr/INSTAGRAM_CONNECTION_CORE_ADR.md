# Instagram OAuth接続 Core・DB ADR

日付: 2026-11-03
状態: PR-1B1 proposed

## Context

`SocialProfile`は発信設定、`ExternalReadGrant`は外部AIへの読取許可であり、InstagramのOAuth資格情報を保存する責務を持たない。資格情報はService会員本人が所有する一方、利用主体はBunshinである。同じInstagramアカウントを複数Bunshinが明示的に利用でき、資格情報をBunshinごとに複製しない構造が必要である。

Meta公式のInstagram Login資料では、初期認可scopeとして`instagram_business_basic`と`instagram_business_content_publish`を利用できる。短期tokenを60日間の長期tokenへ交換し、有効な長期tokenは`GET https://graph.instagram.com/refresh_access_token`（`grant_type=ig_refresh_token`）で更新する仕様である。交換・更新のHTTP AdapterはPR-1B2の範囲とする。

- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)
- [Business Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Content Publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing)

## Decision

- `SocialAccountConnection`をWorkspace / Service / GroupMembership / User所有の資格情報として保存する。
- `SocialAccountConnectionGrant`をBunshinへの明示利用許可として分離する。同一Service・User・platform・externalAccountIdは1資格情報に正規化し、複数BunshinはGrantを共有する。
- 保存・再接続は同じ一意キーをupsertし、Grantもupsertする。Serializable transactionの競合は限定再試行する。
- 解除は対象BunshinのGrantだけを削除し、最後のGrantが消えた時点でtokenを消去して`DISCONNECTED`にする。
- Provider利用直前にWorkspace、Service、User、GroupMembership、会員同意、User/Workspace/Service状態、`SOCIAL`機能権限、Bunshin所有権、ACTIVEなSOCIAL Capability、Grant、接続状態、有効期限を再検証する。
- 期限切れtokenは返さず、tokenを消去して`RECONNECT_REQUIRED`にする。
- tokenは既存`ENCRYPTION_KEY`から環境別HKDFで導出した鍵によるAES-256-GCMで暗号化する。Workspace / Service / Membership / User / platform / externalAccountIdをAADに含め、別scopeへciphertextを移しても復号できないようにする。
- 公開戻り値には暗号文・平文tokenを含めない。平文を返すのは再認可後のserver-only Provider経路だけとする。
- 両tableはRLSを有効化し、広いDB policyは追加しない。正本はApplication/Repositoryの複合scopeとする。

## Consequences

同じInstagramアカウントを複数Bunshinで利用してもtokenは1件だけになり、Bunshinごとの許可と解除を独立して表現できる。別Serviceで同じアカウントを利用する場合はService所有境界を越えて暗黙共有せず、別の明示接続として扱う。PR-1B2はこのCoreへ公式OAuth交換結果を渡し、PR-1B3はGrant単位の状態表示・解除・再接続を行う。
