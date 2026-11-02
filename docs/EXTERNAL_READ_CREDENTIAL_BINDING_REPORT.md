# 外部読取資格: 既存認証基盤の再利用と接続許可への結合

最新のHTTP追加と使いやすさ方針への対応は[最小HTTP実装報告](EXTERNAL_READ_MINIMAL_HTTP_REPORT.md)を参照。本書は資格結合の初回実装記録であり、下記の2/3/5秒上限と公開route未実装の記述は後続変更前の状態。専用の分散制限/read監査台帳は公開の必須条件から外す。

## 1. 調査した内容

基準mainは`7d397821`（PR #1445）。AGENTS、仕様正本、Architecture Principles、Roadmap、Decision Log、外部読取ADR/実装報告、既存Supabase SDK/本人認証・AuthIdentity・grant・監査を確認した。

| 公式資料・既存資産                                                                                                                | 確認と判断                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Supabase OAuth Server](https://supabase.com/docs/guides/auth/oauth-server)                                                       | OAuthの発行基盤候補。独自の認可code/token serverを作らず既存Authとの統合を選ぶ。設定有効化は未実施       |
| [Token Security](https://supabase.com/docs/guides/auth/oauth-server/token-security)                                               | client_id、issuer、subject、session等の署名済みclaimを用いる。通常sessionと外部clientの認可を分離する    |
| [Supabase Sessions](https://supabase.com/docs/guides/auth/sessions)、[Sign out](https://supabase.com/docs/guides/auth/signout)    | access tokenのexpとsessionを区別する。Provider側logoutだけで発行済みJWTの即時無効化を保証しない          |
| [Muse公式ヘルプ](https://www.meta.com/help/superintelligence/1687253048996149/)、[Connectorガイド](https://platform.muse.ai/docs) | API接続・正式提供の案内はあるが、一般向けMuseとのOAuth実機互換は未確認。空catalogを維持する              |
| 既存@supabase/supabase-js / current-user / AuthIdentity                                                                           | 署名・ユーザー検証と既存本人IDの解決を再利用する。emailやuser_metadataによる紐付け・自動会員作成はしない |
| 既存ExternalReadGrant / GroupFeatureAuditLog                                                                                      | 新しい資格table/監査tableを作らず、grantに結合状態だけ追加する                                           |

公式仕様の存在、SDKの合成データ検証、実際のProvider設定・Muse互換を別の状態として扱う。

## 2. 変更したファイル

- Application `external-read-credential.ts`: 検証済み資格/結合Port、結合Use Case、認証と既存利用実績Coreの接続。
- Web `auth/external-read-credential.ts`: Cookieを扱わない既存Supabase SDK Adapter。`services/external-read-credential.ts`: 初期無効の組立。
- Web `auth/current-user.ts`: OAuth tokenを通常の会員sessionへ読み替えない境界。
- Database `external-read-grants.ts`: 本人・client・issuer・sessionの結合hash、冪等結合、署名済み本人と既存AuthIdentityの照合、現在の失効判定。
- schema/migration `20261103020000_external_read_credential_binding`: grantにnullableなhash/日時、整合性CHECK、既存監査enum1値を追加。
- SDKの実署名検証/first-party分離/閉じた組立、Application、SQLテスト、ADR、本報告。

共有変更はApplication indexへのexport追加、既存schema、readinessの最新migration定数。依存package、公開HTTP/UI、Cron、環境変数、接続先catalogは追加・変更しない。

## 3. 主要な設計判断

### 認証と権限

外部Bearer tokenは既存SDKのgetClaimsで検証する。JWT本文のdecodeだけで認証しない。設定されたissuerに固定した検証先を使い、aud/roleはauthenticated、明示的な許可client_id、UUIDのsubject/session_id、iat/exp/nbfを照合する。続いてgetUserの検証済み本人IDとの一致を確認する。Cookie・refresh token・session保存・自動更新を使用しない。

ID token、service role、client_idのない通常ログインtoken、別issuer/client、期限切れ・未来のtokenを受け付けない。正常な署名付きtokenでも、grant未結合なら利用実績を読まない。認証済み資格からclient/environmentを作り、外部リクエストの自己申告principalを受け付けない。

既存current-user境界では、OAuth client_idが非nullの場合に会員APIへのアクセスを拒否する。通常のfirst-party claim（client_idなし/null、aud/role=authenticated）は維持し、署名済みsubとgetUserのID一致を要求する。認証方法が同じことを、既存会員APIの全権限を持つ根拠にしない。

### 一度だけの結合

結合前後に、既存grantの全所有scope・現在の会員/規約/所有/Capability/Feature・期限・失効・client/environmentを照合する。署名済みsubjectは既存AuthIdentityのEMAIL/providerUserIdと既存userIdへ照合し、未登録subjectを自動provisionしない。

環境・接続ID・issuer・subject・client・sessionのversion付きtupleをSHA-256で保存する。token本文、refresh token、JWT user_metadataは保存・監査しない。同じtupleの再送は冪等、別sessionや別本人への付替えは拒否する。別sessionは新しい本人同意と新grantが必要になる。

同じsessionのrefresh後access tokenは毎回署名・期限を再検証し、元のgrant期間内だけ利用できる。refreshでgrantの期限や許可範囲を拡大しない。結合は既存Group排他を使い、revisionを進め、既存監査と同一transactionで保存する。監査には結合済みかどうかだけを追加し、hashや外部subject/sessionを出さない。

### 失効と実行境界

本人解除は既存grantのrevokedAt/revisionを正本とする。tokenが未期限切れでも解除後はDB照合で拒否する。既存Coreの読取前後照合へ結合検証を接続し、読取中の解除、token期限切れ時は結果を破棄する。通常の会員/権限停止も引き続き適用する。

Provider側logoutと本システムの許可解除は別である。Provider sessionの即時失効を必要とする場合は、公式のsession存在照合等を別途設計・検証する。今回、その即時連動を実装済みとは扱わない。

認証の最大待機は2秒、結合DB処理は最大3秒、読取は既存Coreの最大5秒を適用する。AbortSignalと固定error分類を使い、遅延結果を公開しない。transactionのcommit直後に応答が失われる場合もあるため、結合の再送は冪等にする。障害を空の利用実績成功に変換しない。

### 初期状態と公開範囲

接続先catalogが空、またはstagingの場合、組立は停止し認証設定読取/外部認証要求を開始しない。公開read/bind route、OAuth Serverの有効化、OAuth client登録、Provider側の認可同意画面/PKCE flow、分散read admission/読取監査は今回の対象外。既存会員APIを外部へ転用しない。

## 4. 実行した検証

- WebCryptoで合成ES256 JWTを署名し、実SDKのJWKS署名検証とテストAuth応答を組み合わせて検証。改ざん署名、claim差替え、通常session、期限、本人不一致を拒否する。外部Providerへ実データを送らない。
- 通常ログインの維持、OAuth/非会員claimの拒否、署名検証失敗時の自動会員作成防止。
- Applicationの未認証/未結合拒否、読取後の結合再確認、最終権限確認中のtoken期限切れ、検証timeout。
- 使い捨てPostgreSQL16へ全migrationを適用。結合再送・別本人/client/issuer/環境/session・期限・同session refresh・監査rollback・解除後拒否を検証する。
- 既存利用集計と実DBの結合Adapterを接続し、読取中の本人解除による結果破棄を確認する。

最終の型検査、lint、全package、全SQL、既存UI、buildと件数はPR本文へ記録する。

## 5. 未解決事項と本番状況

OAuth Server/PKCE/Provider同意画面の設定、正式client登録、Muse実機互換、分散read admission/監査、公開route、Provider側session即時失効、RLS確認は未完了。空catalogを維持し、実利用可能な接続先を増やしていない。

first-party境界の変更は通常認証の合成回帰を検証し、実Supabaseの本番ログイン・鍵形式・遅延は未実測。旧対称署名ではSDKの検証経路に追加のAuth要求が生じる場合があり、実環境で確認する。鍵・Provider設定は変更しない。

本番DB/migration/認証設定・APIキー・署名鍵・OAuth client・Feature/allowlist・外部データ送信・課金・デプロイは未操作。実装済みとPoC接続成功・本番稼働を区別する。

## 6. 次の作業へ進める条件

最新main、標準CIと全SQL・既存認証/会員/紹介/支援/LINEの回帰、レビューを通過する。本番適用は既存のbackup/readiness手順を伴う別作業とする。

次は分散read admission/読取監査と公開境界の検証、Supabase OAuth Server/PKCE/同意導線とclient登録の準備を進める。実Provider設定・テスト本人の認証/接続/解除・Muse互換・費用/OEM/審査を確認してからcatalog登録と限定PoCを判断する。
