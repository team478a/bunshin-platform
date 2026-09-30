# 非公開サービスの参加者画面Metadata 実装報告

日付: 2026-09-30。基準: main `f4ae6888`（PR #1021マージ後）。本番反映とは区別する。

## 1. 調査した内容

- PR #1019後、ヘルプ・マニュアル・法務閲覧と画面本体は非公開Serviceの既存参加者を許可する一方、参加者専用9画面のMetadataだけPublic Resolverに残っていた。非公開Serviceの本人でも汎用タイトルになる。
- 9画面ともPublic Resolverのエラーを一律にnullへ握りつぶし、DB障害と所属不存在を区別していなかった。公開登録入口のPublic Resolverは匿名向けなので維持すべきである。
- 正本仕様、D-155、Member Service Resolver、画面本文の認証条件と既存テストを確認した。

## 2. 変更したファイル

- `apps/web/src/services/member-service-metadata.ts`: 本人Member Serviceからタイトルを作る共通処理。
- `apps/web/app/s/[serviceSlug]/{home,bunshins,activity,weekly-report,roadmap,diagnosis,90-day-report}`内の9画面: Metadataだけを共通処理へ接続。
- `apps/web/test/member-service-metadata.test.ts`、`private-service-member-metadata-boundary.test.ts`: 非公開本人、匿名、所属外、未知障害と9画面の境界を確認。
- D-158、Roadmap、機能不足監査とこの報告。

## 3. 主要な設計判断

- Metadataは認可ではない。未ログイン/所属外は汎用タイトルにし、ページ本文の既存ログイン・本人・Service判定を変えない。認可失敗以外の障害は再送出する。
- Public Resolverは公開登録入口に残し、非公開Service名を他者へ漏らさない。本人別認可結果をSlugだけでcacheしない。
- Service固有の業種/質問、参加、LINE、文書同意、DB、設定、本番データを変更しない。

## 4. 実行した検証

- Helperと9画面の関連Web4ファイル36テスト、Web型検査、変更format、アーキテクチャ境界と否定10テスト、`git diff --check`成功。変更lintと全体CIの結果はPRに記録する。

## 5. 未解決事項

- 本番反映・実端末/検索結果の確認は別作業。Metadataで使用する表示名が運用上適切かはService管理者が確認する。

## 6. 次へ進める条件

- PRのCI・レビュー・マージを確認する。公開登録入口以外の残る公開判定が本当に匿名向けか、別作業で監査する。
