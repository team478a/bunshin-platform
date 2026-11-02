# 外部読取: 使いやすさ方針への整合と最小HTTP実装

## 1. 調査した内容

基準mainは`1bdae6f4`。`b5530bdb`で着手後、管理画面の通常保存を簡素化したPR #1453も取り込んだ。未マージPR #1446の資格結合を最新mainへ取り込み、ユーザーが指示した「不要な監査・極端な制限を追加しない」方針とPR #1452の文書、既存Core/利用集計/本人解除/運用loggerを照合した。#1446のremote更新はmainのmergeのみと確認し、その履歴も維持した。

認証・所有権・User/Workspace/Service/Bunshin分離、資格の結合/失効、現在の会員/規約/Feature/Capability確認は必要な保護として維持する。取り下げたPR #1450の専用read監査、三軸rate、TTL台帳は再実装しない。

## 2. 変更したファイル

- Application `external-connection-read.ts`、`external-member-usage.ts`、`external-read-credential.ts`: 認可必須/追加制御は任意の依存型、通常経路の待機設定見直し。
- Web `services/external-read.ts`: 既存の資格結合・利用集計を組み立てる。
- Web `http/external-read.ts`と`app/api/external/connections/[connectionId]/{usage,bind}/route.ts`: Bearer専用の限定HTTP。
- 新HTTP/組立/通常待機/制御なしでの失効テスト、既存資格timeoutテスト、ADR、初回報告への追記、本書。

package依存、環境変数、Cron、Feature、接続先catalog、UIは変更しない。#1446が元から含む未マージの資格結合migrationへ、既存方針どおりgrant tableのRLS有効化を補った。新しいschema/table/migrationは追加せず、既存のApplication公開exportも同PRに残る。原本の利用実績や会員・紹介・権限台帳を作り直さない。

## 3. 主要な設計判断

### 任意の追加制御と通常の待機時間

外部読取Coreは資格/grantと現時点の認可を必須にし、追加admission/監査Portは必要な呼出しだけが明示指定する。既存のPortを渡した呼出しでは以前の契約を維持し、追加制御を必要とする呼出しを黙って無効化しない。新しい通常HTTP経路はこれらを渡さず、ダミーの無制限Adapterも専用台帳も作らない。既存のPort型は互換用に維持し、軽い依存型を既存公開入口から公開する。

認証は最大10秒、資格結合は10秒、読取は30秒。読取は既存集計DBのtransaction上限20秒/pool待機3秒を踏まえ、以前のCoreの一律5秒で正常処理を切らない。Coreを内部利用するときは最大60秒まで待機値を指定できる。route実行上限は60秒。無限待機、無限retry、未認証/解除後の遅延結果公開は許可しない。DBの既存transaction設定や既存会員向けの制限は今回変更しない。

### HTTP契約

| Method / path                                        | 内容                                                     |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `GET /api/external/connections/{connectionId}/usage` | 結合済み本人の既存7/30日利用実績DTOだけを取得            |
| `POST /api/external/connections/{connectionId}/bind` | 検証済みOAuth資格を、既に本人が同意したgrantへ冪等に結合 |

どちらも`Authorization: Bearer ...`を要求し、query/bodyは不要で受け付けない。bindのPOSTはbodyなし。対象・許可範囲は保存grantを正本とし、callerからuser/client/service/Bunshinを指定しない。Cookieが付いていても認証へ利用せず、Cookieだけでの呼出しは拒否する。通常ログインや自動会員作成へフォールバックしない。

bindは新しい権限・同意・grantを発行しない。結合でDBへ保存される署名済み本人と既存AuthIdentityの一致、同一sessionの再送、別sessionへの付替え拒否は既存実装を使う。応答はsavedだけとし、scope/hash等を返さない。資格結合の権限変更監査は既存GroupFeatureAuditLogを維持する。

usageは既存canonical集計・最小DTOを使い、原価・Memory・投稿本文・scope・被紹介者情報を追加しない。read前後の資格/grant/認可/期限確認で、本人解除や権限停止後は結果を破棄する。新たな生成・投稿・採否・通知・閲覧活動を発生させない。本人の解除は既存の管理DELETEを使う。

全応答はprivate/no-storeとAuthorizationのVary。入力不正400、Bearerなし401、許可拒否403、無効catalog404、競合409、一時障害503、timeout504等の固定応答とrequestIdを返す。raw exception、token、内部scopeをerrorへ含めず、障害を空の成功データへ変換しない。追加のアプリ回数制限・同時1件制限を設けない。

### ログと初期状態

既存loggerへHTTPのrequestId/操作/固定結果/status/所要時間だけを記録する。本文・token・資格subject/session・connectionId・個人情報・raw errorを追加しない。運用ログが失敗した場合は固定警告にし、成功した通常readを停止しない。専用read監査の永続保存を通常利用の前提にしない。

catalogは空のまま。empty catalogまたはstagingでは認証設定やDBへの接続を開始せず、新入口も利用不可。未確認のMuse client、OAuth Server設定、PKCE画面、MCP transportやprotocol discoveryを推測して追加しない。本APIは当基盤の限定resource契約であり、Muse互換・MCP Server完成を意味しない。

## 4. 実行した検証

- Application: 追加制御なしでの通常read、前後の認可・失効、従来5秒を超える正常read、2秒を超える正常認証、10秒を超える認証の中断、既存の制御を明示した経路の回帰。
- HTTP/route: Bearer専用、Cookieだけの拒否、空catalog、scope/query/body/方法の拒否、既存DTO/結合ack、固定error、ログ障害でも成功、ログの最小投影、複数同時readに新たなquotaを加えていないこと。
- Web composition: 空catalogで既存DB Adapterを作らず、enabled時は既存利用集計と資格Use Caseだけを組み立てる。
- 既存のSDK署名/first-party認証分離、資格結合の実DB/解除/read再照合も同PRの標準CIで再検証する。
- RLS: disposable DBで一時的な非特権roleへ明示的にCRUDをgrantしても直接SELECT/UPDATE/DELETEは0件、INSERTは拒否する。一方、serverの既存Adapterでは資格結合・本人読取を維持する。

最終HEADの標準CI、全SQL、各件数はPR本文へ記録する。追加のHTTPテストは合成Adapter/入力を使い、実Providerへのログインや本番データ送信は行わない。

## 5. 未解決事項と本番状況

実OAuth Server/正式client登録/PKCE認可導線、テスト本人とHTTPS環境、Muse互換・プラン/料金・規約・OEM条件は未確認。投稿案/ミッション本文の外部投影、承認付き採否、SNS投稿は今回追加していない。ログの永続化障害を再現するテストと、実インフラの収集基盤の動作確認は別である。

本番DB/migration、OAuth/Feature設定、catalog有効化、外部アカウント作成・申請・課金・デプロイは未操作。PRの成功やmergeを接続成功・本番提供としない。

## 6. 次へ進む条件

最新mainの標準CI/全SQL/既存認証・会員・支援・紹介・LINE/画面/buildの回帰を通し、#1446をレビュー可能にする。次は公式に確認できる認可方式でテスト本人の接続・本人read・解除を実測するための最小環境を準備する。追加制限は実際の負荷・費用・公式上限等で必要なものだけを検討し、取り下げた専用基盤を復活させない。
