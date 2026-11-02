# 外部読取許可: 本人向け同意・一覧・解除HTTP/UI

## 1. 調査した内容

基準mainは`cc4e0306`（PR #1443）。AGENTS、仕様正本、Architecture Principles、Roadmap、Decision Log、外部接続ADR/保存報告、既存の本人認証・Service/Bunshin解決・Same Origin・負荷制限・ログイン後の戻り先・UI harnessを確認した。

既存ManageExternalReadGrants/PrismaExternalReadGrantRepositoryを再利用する。利用実績を返す外部Agent用APIを新設する作業ではない。既存の会員向けRead APIはACTIVE会員条件であるため、退会/停止後の本人解除へそのまま流用しない。

## 2. 変更したファイル

- `apps/web/src/services/external-read-grant-owner.ts`: slugと本人actorから対象会員/Bunshinを解決、管理Repositoryの組立、最小表示DTO。
- `apps/web/src/services/external-read-client-catalog.ts`: レビュー済み接続先のcatalog。初期空。
- `apps/web/src/http/external-read-grant-owner.ts`とService/Bunshin配下API: GET一覧、POST発行、DELETE解除。
- `apps/web/src/external-read-grant-view.ts`: 画面応答の厳密な契約。
- Service/Bunshin配下`connections`: 本人同意・状態確認・解除確認、CSS。
- 既存Bunshin詳細からの導線、ログイン後戻り先allowlist。
- DB Adapterの`issuanceAllowed`: 発行時と同じ認可を読み取り専用で再利用。probe grantや監査を作らない。
- HTTP/所有範囲/戻り先テスト、SQLケース、390pxのブラウザ5ケース、ADR追記。

共有変更は既存harness入口/configへの追加。DB schema/migration、package依存、Cron、環境変数、既存Feature設定/権限付与は変更しない。

## 3. 主要な設計判断

### 本人の管理と外部認証

管理APIは既存の本人ログインだけを受け付ける。workspace/service/member/userはrequestから受け取らず、slugと対象Bunshin・認証済みactorからサーバーで解決する。管理者による他会員操作を追加しない。各queryにWorkspace/Service/User/Bunshinの境界を含め、DB側の本人照合も維持する。

対象解決には会員/BunshinのACTIVE条件を置かず、現在の本人所有scopeを要求する。新規発行は既存DB Adapterの現在の会員・規約・Capability・Entitlement・client許可を毎回確認し、一覧/解除は停止後も本人が実行できる。

画面候補も`issuanceAllowed`で既存canRead判定を再利用する。新しい資格/会員/履歴tableや独自の権限判定を作らない。接続先catalogは現時点で空であり、新規発行フォームは表示しない。未検証のMuse名を登録しない。既存grantの一覧と解除は有効に保つ。

APP_ENV=development/productionのみ対応し、既存grant schemaが扱わないstagingを他環境に読み替えない。stagingは管理準備中を表示し、mutationを503で停止する。環境追加は認証/保存設計を伴う後続作業とする。

### HTTP境界

GET/POST/DELETEのみ。更新はSame Origin・JSON・最大4096byte・厳密schemaを要求する。余分なscope、environment、許可外operation、同意version差替え、不正期限を拒否する。本人単位で既存MemberUsageReadLimitを使う専用の毎分10要求・同時1要求guardを置き、permitはfinallyで解放する。これはprocess単位の負荷抑制であり、分散quotaではない。

GETはwriteしない。全応答はprivate/no-store。DTOには内部所有scope・token・secret・AI原価を含めない。接続IDは表示用/解除用識別子であり認証資格情報ではない。

更新APIはcommit結果のackだけを返す。後続の一覧読取障害を、commit済み操作の失敗へ読み替えない。画面は保存成功と一覧更新失敗を別に表示する。DBのrevision競合・認可拒否・障害は成功表示に変換しない。

### 本人向け画面

接続先、対象投稿パートナー、7日/30日の利用実績という読取範囲、期限、解除後の扱いを表示する。投稿本文/Memory等を送る許可ではないこと、外部接続の完了とは別であることを明記する。期間/client変更時は同意チェックを外す。

発行要求の通信障害では同じcommandIdを保持し、同内容の再送で重複作成しない。保存ack後にIDと同意をリセットする。解除は確認画面からexpectedRevisionを送る。許可中/期限切れ/解除済みは一覧取得時の状態として表示し、再読込を提供する。対象Bunshin変更時はcomponent keyを変えて同意状態を共有しない。

白いパネル、日本語の太い文字、390pxでの操作、読み上げ用label/status/alertを使用する。ハッシー固有段階・特典、MUSE/Zapierの具体認証を共通機能へ混在させない。

## 4. 実行した検証

- HTTP/所有範囲/catalog/ログイン戻り先31ケース成功。
- 新規スマートフォンブラウザ5ケース成功。同意必須・期間変更時の再同意、発行内容、再送ID、停止中の解除、競合、保存済みだが一覧更新失敗を確認。
- 390pxのスクリーンショットを目視し、日本語・フォーム・解除状態の読みやすさと横はみ出しなしを確認。
- SQLに発行可否の読み取り専用判定とgrant/監査が増えないケースを追加。最終の全SQL、型検査、lint、format、全package、既存UI、buildの結果はPR本文に記録する。

## 5. 未解決事項と本番状況

外部認証/OAuth/tokenとgrantの結合、分散read admission/読取監査、外部Agent用read route、投稿案/ミッション本文投影、Muse実機・費用/OEM/審査条件は未実装/未確認。接続先catalogは空で、新規の実接続はできない。UIテストの接続先はharness内の合成データだけで本番catalogへ加えない。

本番DB、migration、Feature設定、allowlist有効化、外部送信、申請、課金、デプロイは未操作。前PRのmigration適用・readinessが本番反映の前提であり、mergeだけで本番反映済みとは報告しない。

## 6. 次の作業へ進める条件

標準CI・全SQL・既存UIの回帰とレビューを通過すること。次は実認証の方式とMuse互換性を確認し、資格情報とgrantの結合・失効、分散read admission/監査を用意する。未検証clientをcatalogへ追加したり、認証なしの外部read routeを開いたりしない。テスト本人の接続・解除を確認後に限定PoCを判断する。
