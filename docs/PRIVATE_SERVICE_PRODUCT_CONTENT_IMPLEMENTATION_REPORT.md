# 非公開サービスの本人商品紹介API 修正報告

日付: 2026-09-30。基準: main `8ba7863f`（PR #1015マージ後）。参加者API監査の第5作業単位。本番反映とは区別する。

## 1. 調査した内容

- 本人の商品プロフィール保存/非表示、コピー/自己申告投稿、紹介文生成は認証済み操作だが公開限定Resolverを使用していた。
- Schemaと非表示IDの検証例外が500として返るため、許可入力を広げず400へ明示変換する。
- 紹介文生成は組織QuotaだけにScopeを渡し、既存Service QuotaのgroupIdが欠落していた。自Service IDを既存Quotaへ追加する。
- 最新の本人商品プロフィール/AI紹介文/活動報告とApplication/Databaseの所有条件・公開入口・Webテストを確認した。

## 2. 変更したファイル

- `apps/web/src/http/member-product-profiles.ts`: Member認可、厳格Schemaと非表示IDの400変換。
- `apps/web/src/http/member-product-activity.ts`: Member認可、厳格Schemaの400変換。
- `apps/web/src/http/member-product-suggestions.ts`: Member認可、厳格Schemaの400変換、自Service Quota Scope。
- `apps/web/test/member-product-http.test.ts`: 実Application ServiceのHTTP実行と認証/Scope/所有拒否、生成条件/失敗/Quota/ログ検証。DB PortとProvider等はmock。
- `apps/web/test/member-product-content-ui.test.ts`: Member Resolver境界とService Quota Scopeの静的検証。
- D-152、Roadmap、機能不足監査、この報告。

## 3. 主要な設計判断

- 認証後のMember Service解決で利用期間・ACTIVE Workspace/Group/本人所属を守る。Workspace/Group/操作者をリクエストから受け取らない。
- 商品プロフィール・活動・投稿パートナー・ACTIVE MEMBER URLと同意・自Service公式商品/公開期間の既存Repository再照合を維持する。別Service/本人所有拒否のnull結果は404、未知障害は500とする。
- ProviderへURLを送らず、本人設定・自Serviceの公式商品を再取得する。出力のURL/禁止表現拒否、承認URL/#PR/公式必須表記/媒体上限を維持する。
- 生成QuotaへgroupIdを追加するが、上限値/設定/予約解放方式は変更しない。組織QuotaとService Quotaの既存ガードを使う。上限拒否時はProviderを呼ばない。
- モデル/Prompt版/Token/原価/時間/成否の記録と活動の再送/候補別重複防止を維持する。SNSへ自動投稿した証拠とは扱わない。
- 実AI/LINE/Storage呼出、設定、DB schema/migration、匿名公開入口、本番データを変更しない。

## 4. 実行した検証

- 関連3ファイル92テスト成功。新規HTTP実行72件、UI/静的認可境界15件、既存Provider契約5件。生成後の所有拒否、3媒体の上限/PR表記、Service上限拒否を含む。
- アーキテクチャ境界とその否定テスト10件、初回変更コードlint、`git diff --check`成功。最終型/lint/format、全Web、全package/実DB CI結果はPRと作業報告へ記録する。
- 実Application Service/Finalizerを使用し、認証/Service Resolver/DB Port/Runtime/Quota/Provider/ログをmockする。実生成・課金・通知を行わない。

## 5. 未解決事項

- 動画通知等のAPIと画面に残る公開判定は別監査。全非公開サービス対応完了とは報告しない。
- 生成中の所属/URL/設定変更に対する新しい排他・Provider直前再検証は追加しない。既存の生成後活動記録によるRepository再照合と返却拒否を維持する。
- AI成功ログは生成成功、活動保存成功とは別。活動記録失敗時に候補を返さない既存挙動を変更しない。
- 本番反映、Service上限下の実端末操作確認は別作業。

## 6. 次へ進める条件

- 本PRのCI成功・レビュー・マージを確認する。
- 動画通知・画面の匿名/参加者/管理者認可を次の独立単位で監査する。本番リリース/設定変更は別途扱う。
