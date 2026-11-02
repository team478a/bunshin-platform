# 外部読取PoC: 実環境の準備と実行

## 現在地と今回の範囲

基準main `2321d21d`（PR #1446）に本人のOAuth資格結合、利用実績GET、本人向け解除がある。今回追加したものはこれらを使うCLIと合成HTTPテスト。アプリの認証・許可・利用集計を再実装しない。接続先catalogは空のまま、OAuth Server設定・client登録・実デプロイ・外部アカウントや料金は変更していない。

テスト環境とMuseアカウントの準備状況は確認待ち。**合成HTTPテスト成功は、実OAuth/Muse接続成功ではない。** 本書は通常ユーザー向けの追加手続きではなく、限定PoCの操作者向け手順である。特別な監査台帳、利用制限、承認システムを追加しない。

## 先に用意するもの

| 項目       | 既存機能・準備内容                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| テスト環境 | 本番と分離したSupabase/DBとHTTPSアプリ。既存migration/readinessを適用し、本番から実データを複製しない                                      |
| テスト本人 | 既存ログインで参加・Bunshin・SOCIAL・必要なFeatureを利用できる合成会員。別本人の拒否確認用会員も合成データで用意                           |
| OAuth      | 下記の公式設定、正式なclient ID/登録済みredirect URI、Provider認可画面。通常ログインtokenや共有service-role/APIキーで代用しない            |
| 接続許可   | テスト用buildだけで確認済みclientをcatalogに登録し、既存本人向け画面で対象Bunshinの利用実績readに同意・許可。DBへ手作業でgrantを捏造しない |
| Muse       | テスト本人のアカウント・利用プランと、Custom Connectorが実際に要求する認証・接続情報。未確認のtransportや仕様を推測実装しない              |

本番catalogを有効にしない。既存`staging`は別環境へ読み替えず停止する実装なので、独立した検証用deploymentでアプリとDB/Authの環境を揃える。`APP_ENV`を書き換えて本番への接続をテスト環境と偽らない。

## 公式設定で確認する箇所

2026-11-03に[Supabase OAuth Server概要](https://supabase.com/docs/guides/auth/oauth-server)と[Getting Started](https://supabase.com/docs/guides/auth/oauth-server/getting-started)を再確認した。OAuth Serverの有効化、Authorization Path、client登録はProvider側の準備である。

- Authorization PathはSite URLと組み合わされる。認可画面ではSDKの`auth.oauth.getAuthorizationDetails`、`approveAuthorization`、`denyAuthorization`を使う。未ログイン時は認可要求を保持して既存ログインへ戻す。独自のcode/token発行serverを作らない。
- **bunshin側のProvider認可画面は未実装**。ダッシュボードへ存在しない`/oauth/consent`を設定するだけでは接続できない。次の実装単位でSDKと既存ログインを接続する必要がある。OAuth同意は外部SNS投稿や採否操作の包括承認にはしない。
- clientの登録済みredirect URI・Public/Confidential区分・PKCE等は公式仕様に合わせて決める。Museの実際の要求を確認してから、確認済みclient IDとアプリcatalogのIDを一致させる。秘密鍵やclient secretをチャット・PR・通常ログへ貼らない。
- API URLは本アプリの`/api/external/connections/{connectionId}/usage`。資格結合POSTは`.../{connectionId}/bind`でbodyなし。これらは限定resource APIであり、MCP discovery/transportを実装済みとは説明しない。

[Muse公式Custom Connector説明](https://www.meta.com/help/superintelligence/1687253048996149/)はAPI情報を使う接続を案内しているが、一般向けの認証手順の詳細までは確定できない。[Connectorガイド](https://platform.muse.ai/docs)はread/writeの区分、認証情報、test/production環境の識別を求める。実機から求められる接続情報を確認し、readを権限変更やSNS操作と混ぜない。

## CLIで結合・取得・解除後の拒否を確認する

このCLIは既に発行されたOAuth access tokenを使う。OAuthログインを自動発行したり、通常sessionのCookieを外部へ渡したりしない。

1. テスト本人の接続画面 `/s/{serviceSlug}/bunshins/{bunshinId}/connections`で、対象と期間を確認して許可する。connection IDを控える。これは資格tokenではない。
2. 確認済みOAuth認可フローで同じ本人/clientのaccess tokenを取得する。refresh tokenやclient secretを渡さない。
3. PowerShellで次を実行する。tokenはマスク入力し、コマンド引数やファイルへ保存しない。URLとIDは自分の隔離テスト環境の値へ置き換える。

```powershell
$env:EXTERNAL_READ_POC_BASE_URL = 'https://your-isolated-test.example'
$env:EXTERNAL_READ_POC_CONNECTION_ID = 'your-existing-connection-uuid'
$env:EXTERNAL_READ_POC_ACCESS_TOKEN = [System.Net.NetworkCredential]::new('', (Read-Host 'OAuth access token' -AsSecureString)).Password
try {
  node scripts/test/external-read-poc.mjs
} finally {
  Remove-Item Env:EXTERNAL_READ_POC_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
```

4. ツールが結合POSTと利用実績GETを行う。画面に案内が出たら、**既存の本人画面で対象を解除し「解除済み」を確認してから**Enterを押す。ツールは同じtokenでGETし、403/DENIEDを確認する。新たな解除APIや管理者の代理操作は使わない。
5. 結果はbinding/DTO契約/解除後拒否の固定分類のみ。token、scope、URL、本文、利用件数は出力しない。成功時も`museCompatibility: not-tested`と明示する。

tokenの期限を過ぎた場合は`POC_TOKEN_EXPIRED_INCONCLUSIVE`となり、解除成功に数えない。期限値のdecodeは試験中の期限確認に限り、署名検証の代用ではない。認証はAPIの既存SDKが担当する。

403単独は、権限停止・別scope・token失効でも起こり得る。前段の成功と既存画面の「解除済み」を合わせて確認し、他の権限・Feature・設定を同時に変更しない。Muse側の解除だけでbunshinの解除が完了したと扱わない。

## エラーの読み方

| 分類                             | 次の確認                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `POC_CONFIGURATION_INVALID`      | URL/UUID/access tokenの入力。remoteはHTTPS、ローカル合成試験だけHTTP loopbackを利用    |
| `POC_BIND_FAILED`                | catalog・環境・同意・本人/client/session、API応答。404を接続成功と扱わない             |
| `POC_READ_FAILED`                | 保存grantの結合・所有/所属/Feature・期限。エラーを空データで成功にしない               |
| `POC_USAGE_CONTRACT_INVALID`     | APIの最小DTOとの不一致。原価やscope等が追加されていないか開発者が確認                  |
| `POC_TOKEN_EXPIRED_INCONCLUSIVE` | 試験を中断し、本人の認可からやり直す。別sessionへの付替えは新grantが必要               |
| `POC_REVOCATION_NOT_CONFIRMED`   | 本人画面の解除対象と応答を確認。障害503や別errorを解除成功としない                     |
| `POC_REQUEST_FAILED`             | 接続先・TLS・HTTP redirect・到達性。固定errorのみを出し、raw例外や資格をログへ出さない |

CLIの60秒待機はアプリrouteの実行上限に合わせたもの。無限retryはせず、通常ユーザーの回数制限・日次quotaを追加するものではない。HTTP redirectへBearerを転送しない。

## 検証・未完了・次の作業

`pnpm test:external-read-poc`はNode24の合成HTTPテスト10件。loopbackで結合/取得/解除後拒否を通し、redirectへの資格転送、期限切れの誤判定、DTOへの内部情報混入、CLIの秘密出力を検証する。Windowsの日本語pathも`fileURLToPath`で扱う。既存CIのverifyへこの短いテストを追加する。共有変更はpackage scriptsの追加とCI stepの追加、既存ADRへの追記のみ。

schema/DB/migration、Web/Domain/Application、Feature、catalog、環境変数定義、本番設定は変更しない。CLI専用envは上記3項目で、アプリの設定項目を増やさない。

残る作業は隔離環境・テスト本人の確認、公式SDKのProvider認可画面、client/redirect登録、実OAuthとMuseの実機試験、費用/OEM/規約の判断。実測記録には対象のtest deployment SHAと観測結果だけを残し、tokenやユーザー素材を含めない。新たな監査台帳・追加の承認手続きは作らない。
