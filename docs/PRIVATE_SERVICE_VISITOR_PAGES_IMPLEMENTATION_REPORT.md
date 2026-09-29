# 非公開サービスの閲覧ページ 権限分離報告

日付: 2026-09-30。基準: main `30c92f63`（PR #1018マージ後）。参加者画面監査の第8作業単位。本番反映とは区別する。

## 1. 調査した内容

- サービスのヘルプ本文はログインUserを必ずMemberとして解決するため、公開Serviceの未参加Userだけが匿名訪問者より不利になっていた。
- 千ノ国/占いマニュアルは公開Resolverだけを使い、非公開Serviceの既存参加者も404だった。React cacheはSlugだけをキーにしていた。
- 規約/プライバシー/商取引表示も公開Resolverと公開参加Viewだけを使用。参加ViewのDB実装はvisibility PUBLICが必須のため、非公開Serviceの本人にも文書を返せなかった。
- サービスの入口は匿名の公開登録/案内に使われている。各参加者画面本体は既にMember Resolver/管理Resolverを使い、残るPublic Resolverの多くはMetadataだけだった。
- 正本仕様/設計原則、認証フロー分離報告、ヘルプ/法務/マニュアル実装、公開入口と既存境界テストを確認した。

## 2. 変更したファイル

- `apps/web/src/services/public-service.ts`: 訪問者用にMember→Publicの限定解決を追加。
- `apps/web/app/s/[serviceSlug]/{help,manual}/page.tsx`: 訪問者別の解決と本人別マニュアルcacheキー。
- `apps/web/app/s/[serviceSlug]/service-legal-page.tsx`: 非公開参加者向け公開済み法務文書のService限定取得。
- `apps/web/test/{public-service,private-service-rich-menu-boundary,service-visitor-pages}.test.*`: 実行/境界テストを追加・更新。
- D-155、Roadmap、機能不足監査とこの報告。

## 3. 主要な設計判断

- ログイン済みならまずMember Serviceを本人IDで解決。所属/非公開によるNOT_FOUND/FORBIDDENだけはPublic Serviceを確認する。公開Serviceの未参加Userへ匿名と同じヘルプ・マニュアル・法務閲覧を維持し、非公開Serviceの他人/匿名はPublic側でも拒否する。DB等の未知障害ではfallbackしない。
- マニュアルはSlugに加えUser ID/nullをReact request cacheのキーとし、別参加者/匿名へ認可結果を混ぜない。
- 非公開法務文書はMember Serviceで解決したWorkspace/Group、対象type、PUBLISHEDかつ有効日時以前、最大versionだけを読む。公開Serviceは従来の参加Viewを維持する。DRAFT/未来版や他Service文書は読まない。
- 公開登録/参加申請・法務同意の必要版/条件、管理ページ/権限、Service固有の業種/質問を変更しない。非公開への新規参加・匿名閲覧を追加しない。

## 4. 実行した検証

- 関連Web5ファイル45テスト成功。共有Resolverの匿名/公開未参加/非公開本人/他人/未知障害、ページでの本人/Service別マニュアルと規約/Privacy/商取引の公開済みScope、従来の匿名公開参加View、ヘルプ/リッチメニュー境界を確認。
- Web型検査、変更lint/format、アーキテクチャ境界と否定テスト10件、`git diff --check`成功。全Webと全package/隔離実DB CIの最終結果はPRと作業報告に記録する。ページテストの認証/DBはmockであり、本番実端末の法務閲覧証拠ではない。

## 5. 未解決事項

- 他の参加者画面のPublic Resolverは主にMetadataのService名取得に残る。非公開Serviceでは汎用タイトルになるため、表示改善は別作業。公開登録入口のPublic Resolverは維持する。
- 公開参加Viewの既存文書選択や参加同意の版判定ロジックは変更しない。非公開文書の公開運用・法務内容の妥当性は本修正の検証外。
- DB schema/migration、設定/本番データ、実LINE/AI、通知/Provider、本番反映と実端末確認は含めない。

## 6. 次へ進める条件

- 本PRのCI成功・レビュー・マージを確認する。
- 残る公開判定の用途別監査を続ける。本番リリース/実端末確認は別途扱う。
