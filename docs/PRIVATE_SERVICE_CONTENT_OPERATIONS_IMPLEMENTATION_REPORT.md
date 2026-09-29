# 非公開Serviceの商品パック・Campaign管理API 実装報告

日付: 2026-09-30。基準: main `64dcff74`（PR #1022マージ後）。本番反映とは区別する。

## 1. 調査した内容

- 商品パックとCampaignの管理画面は`CONTENT`権限で非公開Serviceを扱う一方、対応する5 API入口はPublic Resolverを先に呼び、非公開Serviceの権限者も操作できなかった。
- API下層のProduct Pack/Campaign Serviceは本人RoleとWorkspace/Group所有、状態遷移を検証する。公開登録入口は匿名用のため変更しない。

## 2. 変更したファイル

- `apps/web/src/http/service-content-context.ts`: 本人のCONTENT権限とAPI失敗応答の共通処理。
- `apps/web/app/api/services/[serviceSlug]/{product-packs,campaigns}`配下の5 API入口: 管理Service解決に変更。
- `apps/web/test/service-content-context.test.ts`、`service-content-operations-boundary.test.ts`: 非公開権限者、匿名、所属外、障害、API入口を検証。
- D-159、Roadmap、機能不足監査とこの報告。

## 3. 主要な設計判断

- 画面とAPIを同じ`CONTENT`権限に揃える。管理ServiceのWorkspace/Groupを下層へ渡し、入力のGroup IDと対象Pack/Campaignの所有再検証は維持する。
- 認証前や権限不足で操作を呼ばず、未知のDB障害を不存在へ変換しない。Service固有フロー、Provider、設定、DB schema、本番データは変更しない。

## 4. 実行した検証

- 関連Webテスト、型検査、lint、format、アーキテクチャ検査とCIの結果をPRに記録する。

## 5. 未解決事項

- 本番反映・実端末の管理者操作確認は別作業。外部計測の公開受口は別の用途として追加監査する。

## 6. 次へ進める条件

- CI・レビュー・マージ後、本番で非公開Serviceの内容編集者による商品/ Campaign操作と権限外拒否を確認する。
