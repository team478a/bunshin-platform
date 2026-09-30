# 非公開サービスの投稿操作・成果・日々の記録API 修正報告

日付: 2026-09-29。基準: main `a2a1f25e`（PR #1013マージ後）。機能不足監査の第3作業単位。mainマージと本番反映は別扱い。

## 1. 調査した内容

- 共通Daily Mission操作Scope、業務成果保存、SNS数字保存/スクリーンショット読取、日々のメモ/写真記録に公開限定Resolverが残っていた。非公開Serviceの既存参加者が対応画面を開けても操作できない。
- 業務成果保存は公開判定から設定を取得し、別途認証とScopeを取得していた。設定と保存先を同じMember Service解決結果から作るようにする。
- 投稿採否・実行完了等・自己申告投稿・評価は既存SOCIAL Use Case/Repositoryで本人・Service・Missionを扱う。Scope変更で権限や生成Policyを広げない。

## 2. 変更したファイル

- `apps/web/src/http/service-daily-mission-http-core.ts`: 認証後のMember Contextを共通化し、既存Scopeの4項目だけを返す。
- `apps/web/src/http/service-daily-mission-outcomes.ts`: 業務成果の機能設定とScopeを同じContextから解決。
- `apps/web/src/http/service-social-insights.ts`: SNS数字/画像読取を認証後のMember Service解決へ変更。
- `apps/web/src/http/service-daily-actions.ts`: メモ/写真記録も同じ解決方式へ変更。
- HTTP実行テスト2件追加、日々の記録の既存実行テストと境界テスト3件更新（Variantの共通認可検証を含む）。
- Decision Log D-150、Roadmap、機能不足監査、この報告書。

## 3. 主要な設計判断

- 参加者操作の入口は公開状態でなく、既存Member Resolverの利用期間・ACTIVE Workspace/Group/本人所属で決める。匿名登録・公開入口・Metadataは変更しない。
- Scopeはサーバーで解決したWorkspace/Group、認証済み操作者、対象Bunshinで作る。既存Schema、同一Origin、Bunshin本人所有、参加同意、SOCIAL能力、Mission/投稿者条件を維持する。
- 業務成果とSNS数字記録の`businessProfileEnabled`制限を維持する。千ノ国等で不要な機能を有効化せず、業種/初回質問フローを混在させない。
- 共通Scopeを使うMission一覧/生成/VariantもMember認可になるが、生成のService Safe Mode、用語・知識・ポイント・冪等性等のPolicyは変更しない。実AI生成や通知は行わない。
- 自己申告投稿の紹介Milestone、採用/閲覧の使用量記録、活動再送キー、既存Metricsの保持、写真権利/Storageの検証・削除/参照条件を維持する。テストのStorage/抽出Provider/Repositoryはmockし本番へ接続しない。
- DBコード/schema/migration、設定、個人用API、本番データは変更しない。

## 4. 実行した検証

- 対象Web6ファイルで136テスト成功。日々の記録へ匿名・非参加者・Service切替の追加テスト3件を含む。
- 初回全Web検証は2,218件中2,217件成功。Variantの静的境界テスト1件に旧公開限定Resolverの期待値が残っていたため、Member Resolver使用と公開限定Resolver不使用の検証へ更新した。修正後の対象6ファイル143テスト成功。生成Policy・Origin・入力Scope拒否の検証は維持し、全WebとCIを再実行する。
- 追加HTTPテストは実Application/SOCIAL Use Caseを使用し、認証・Service Resolver・Repository・画像抽出Portをmockする。非公開参加者の操作、別Service/Bunshin切替、所有拒否、ID注入/異Origin、SOCIAL停止、Service固有の機能制限、投稿者照合、Metrics/使用量のScopeを確認する。
- Web型検査、変更コードlint、format、既存DB所有境界19テスト、アーキテクチャ境界とその10テスト、`git diff --check`が成功。全Webの最終結果はPRと作業報告で確認する。実DB統合と全体buildはCIの隔離環境で検証する。

## 5. 未解決事項

- 本番反映と非公開Serviceの実スマートフォンでの一連の操作確認は別作業。今回実AI/LINE/Storage呼出は行わない。
- 今回のScope変更は操作途中の所属/利用期間変更に対する新しい排他保証を追加しない。既存Repositoryの権限条件と再検証を維持する。
- 商品紹介・紹介リンク・初回設定・動画通知など別機能の公開限定Resolverは今回変更していない。公開判定が必要な匿名導線と、参加者認可へ合わせる必要のある導線を個別監査する。全APIの非公開Service対応が完了したという報告にはしない。

## 6. 次作業へ進める条件

- 本PRのCI成功・レビュー・mainマージを確認する。
- 別機能APIは公開/参加者/管理者の意図とService固有の設定を確認し、作業単位を分ける。productionリリースは別途確認する。
