# 外部OAuth認可画面の実装報告

## 1. 調査した内容

基準mainは`da63da42`。PR #1455の`cd788c62`で着手後、mainへマージされたPR #1454の学習承認画面簡素化も取り込んだ。AGENTS、仕様正本、Architecture Principles、Roadmap、Decision Log、外部読取ADR・PoC手順、既存本人session/ログインreturnTo/SDK/catalog/HTTPを確認した。

[Supabase公式手順](https://supabase.com/docs/guides/auth/oauth-server/getting-started)と、lockfileで導入済みのauth-js 2.112.3の型を照合。`getAuthorizationDetails`は認可詳細または認可済みredirectを返し、approve/denyは`skipBrowserRedirect`を指定できる。code/tokenの発行・PKCE検証はProviderへ委ね、独自serverを作らない。

今回のUIは外部アプリが本人情報への接続を要求したときだけ表示する。通常のハッシー閲覧・投稿準備へ確認操作、監査台帳、回数制限を追加しない。

## 2. 変更したファイル

- `/oauth/consent`のserver pageと再利用するcard、`POST /api/oauth/decision`。
- Web `services/oauth-consent.ts`: 既存SDK、確認済みcatalog、現在のfirst-party本人による認可処理。
- `auth/current-user.ts`: 既存署名/本人照合を関数として抽出し、通常会員APIとOAuth画面で共用。会員provisionや認証条件は変更しない。
- `auth/oauth-consent-path.ts`と`line-return.ts`: 既存ログインへ安全な認可要求returnToを追加。
- catalogの任意callback metadata、NextのOAuth path限定headers、単体/HTTP/ページ/スマホテスト、既存e2e harnessへの追加、ADR、本報告。

共有変更は既存catalog型への任意項目追加、Next headersへの追加、e2e入口/configへの追加、既存ADRへの追記。DB/schema/migration、Domain/Application、package依存、環境変数、Cron、Feature、有効な接続先は追加しない。

## 3. 主要な設計判断

### 既存ログインと本人確認

OAuth画面は既存first-party sessionの署名・aud/role・client_idなし・getUserとのsub一致を再利用する。外部OAuth tokenを通常sessionへ読み替えず、この画面から会員を自動作成しない。Providerの本人IDをSDKの認可詳細user.idへ照合し、Platform User IDと混同しない。

未ログイン時は`/login?returnTo=...`へ移動し、LINE/メールの既存経路で再開する。returnToは`/oauth/consent?authorization_id=...`だけを追加許可し、URL/追加query/重複ID/fragment/正規化別名を受け付けない。OAuth経路を継続するためだけに共通の業種等オンボーディングを強制しない。他の戻り先の挙動は維持する。

### 確認済みclientと要求内容

catalogは従来の空配列を維持する。`oauthRedirectUris`を任意metadataとして加え、OAuth画面で使うclientはProvider登録済みcallbackと一致させる。既存の利用実績APIや本人向け許可管理がcallback metadataに依存するようには変更しない。

catalogが空、callback未設定、stagingではSDK・本人認証を呼ばず準備中表示。確認済みclient名、本人のアカウント、要求scopeを表示する。`openid/email/profile`を意味の分かる日本語で案内し、メールやprofileを要求する場合に隠さない。未対応scopeや別client/user/request/callbackは承認前に拒否する。

OAuthで認可しても、既存Bunshin/Serviceのread grant、Feature、期間、本人解除は別の正本として維持する。この画面からgrantの発行・更新・延長、SNS投稿、採否の承認を行わない。ハッシー固有のブランド・段階を共通認可画面へ埋め込まない。

### 許可・拒否と再接続

本人の明示操作をSame Originのform POSTで受け、現在の本人とProvider詳細を再取得する。入力は認可要求IDとapprove/denyのみ。hidden callbackやscope、userId、clientIdを信用しない。SDKのapproveまたはdenyの一方だけを呼び、確認済みcallbackにcode/state/errorを保持して303で戻す。

SDKが既認可redirectを返すGETでは、確認済みcallbackへ照合して戻し、確認を繰り返さない。POST時に既に処理済みとなった要求は、新たに承認したことにせず再開案内へ戻す。接続先URLはHTTPS、開発環境のloopbackだけHTTPを許可する。登録済みqueryの変更、別host/path/fragment、credentials付きURL、未知の追加queryを拒否する。

Nextの既存anti-framing headerを維持し、新OAuth pathはprivate/no-storeにする。認可ページはsame-originのreferrer policy、decision応答はno-referrerとする。ページをno-referrerにするとnative formのOriginもnullとなり通常操作が拒否されることを実ブラウザで再現し、外部へ参照元を送らず内部POSTのOriginを維持する設定へ修正した（[Fetch仕様](https://fetch.spec.whatwg.org/#append-a-request-origin-header)）。Origin検証は緩めない。Providerの生error・code・tokenをerror表示やログへ出さない。ブラウザのform失敗は読みやすいページと再確認リンクへ戻し、JSON利用者には既存の固定error形式を使う。

### 画面と初期状態

既存PublicShell/stylesでスマホ向けの大きな「許可する」「許可しない」を表示する。中間の確認画面や新しい審査手続きを追加しない。Provider認可画面のURLは`/oauth/consent`だが、ダッシュボードのAuthorization Path、Site URL、client/callback登録、catalog有効化は別途テスト環境で確認する。本変更だけでは接続を有効化しない。

## 4. 実行した検証

- Service/HTTP: 空catalog/staging停止、未ログインreturnTo、確認済みclientと要求scopeの射影、許可/拒否の選択、現在の本人/要求差替え、未対応scope、callbackとstatic query、既認可・処理済み要求、CSRF、余分なform、固定error/headers。
- 既存first-party/OAuth session分離、AuthReturnAttemptの回帰とページの準備中/ログイン/既認可redirect/安全な再確認表示。
- 390px実ブラウザ2件: 両方の選択で送信内容が認可ID/選択だけ、横はみ出しなし。スクリーンショットを目視し、アカウント・scope・ボタンの読みやすさを確認。
- 初回型検査は新worktreeのPrisma生成物未作成で失敗したため、生成後に再検証する。失敗を成功に数えず、最終HEADの標準CI/全SQL/画面/build結果はPRへ記録する。

SDKを合成Adapterで置き換えた試験であり、実Providerへの認可やMuse接続成功ではない。利用者素材や本番tokenを使用しない。

## 5. 未解決事項・本番状況

隔離テスト環境・テスト本人、OAuth Server設定、clientとcallback登録、catalog設定、Providerの実認可とMuse互換、費用/規約/OEMは未確認。本番DB・Provider・Feature・catalog・申請/課金・デプロイは未操作。既存のAPI結合/read/解除試験CLIは引き続き利用する。

## 6. 次の作業へ進む条件

最新mainと標準CI、全SQL、通常ログイン/会員/LINE/既存画面を通す。次に確認済みの隔離環境とテスト本人で、公式のclient/callbackを設定し、認可画面の許可/拒否、既存grantへの資格結合、本人read、本人解除後の拒否を実測する。通常ユーザーへの開放や本番変更は、実測・費用・運用条件を確認してから別に判断する。
