# 非公開サービスのSNS設定・発信計画API 修正報告

日付: 2026-09-29。基準: main `8b80279d`（PR #1012マージ後）。機能不足監査の第2作業単位。mainマージは本番反映の証拠ではない。

## 1. 調査した内容

- 投稿パートナー操作を修正した後も、SNS設定・アカウント発信方針・投稿テーマ・週間計画の4種類のHTTP APIは公開サービス限定のResolverを使っていた。非公開Serviceの既存参加者は対応画面を開けても操作できない。
- 同じ画面の各RepositoryとSOCIAL Use CaseはService/Bunshin本人所有条件・能力確認を既に持つ。今回の変更は入口のService解決を合わせるものであり、既存権限を広げない。
- `service-social-insights.ts`などの成果/振り返りと投稿操作は次の作業単位に分ける。

## 2. 変更したファイル

- `apps/web/src/http/service-social-profiles.ts`
- `apps/web/src/http/service-account-strategies.ts`
- `apps/web/src/http/service-content-pillars.ts`
- `apps/web/src/http/service-weekly-plans.ts`
- 上記4種類の既存境界テストと`apps/web/test/service-social-planning-http.test.ts`
- Decision Log D-149、Roadmap、機能不足監査、この報告書。

## 3. 主要な設計判断

- 各Scope関数で認証済みUserを先に取得し、既存`resolveMemberServiceContext(serviceSlug, actor)`でServiceを解決する。利用期間・ACTIVE Workspace/Group/本人所属は既存Resolverを再利用する。
- Workspace/Group/操作者はサーバーだけで指定する。リクエスト本文からIDの追加を許さず、既存Schema・同一Origin検証・Repositoryの本人所有条件・SOCIAL能力確認を維持する。
- 対象は19操作: SNS設定の一覧/作成/編集/有効化/無効化、投稿テーマの一覧/作成/取得/編集/有効化/無効化/削除、発信方針の一覧/生成/承認、週間計画の一覧/生成/確定/期限終了。
- 生成に渡す自Service公式知識、Campaign、用語変換、業務投稿配分、Quota・使用量・冪等キー、確定済み計画の参照保護は変更しない。実AI/LINE呼出をせず、テストで生成Portをmockする。
- 個人用API、公開登録・Metadata、Service固有の業種・初回設定、設定値、本番データ、DB schema/migrationは変更しない。

## 4. 実行した検証

- 対象Web5ファイル/149テスト成功。追加HTTPテスト137件は実際のApplication/SOCIAL Use Caseを使用し、認証・Service Resolver・Repository Port・生成Portをmockする。非公開参加者の成功、認証前の参照拒否、Scope解決拒否、別Service/Bunshin切替、所有権拒否、ID注入・異Origin拒否、SOCIAL停止拒否、知識入力と既存競合エラーを確認。
- DB既存本人所有境界テスト11件成功。DBコードは変更しない。実DB統合、全体lint/buildはPRのCIで確認する。
- Web型検査、変更コードlint、format、アーキテクチャ境界検査とその10テスト、`git diff --check`が成功。
- ローカル全Web実行は391ファイル/2,103件中2,102件が成功し、既存の全ソース用語チェック1件が5秒制限でtimeoutした。該当テストと追加HTTPテストを単独再実行した139件は成功。テストのtimeout値や内容を弱めず、全体の最終結果をCIでも確認する。

## 5. 未解決事項

- 投稿採否・完了・成果保存/振り返りの操作APIに残る公開限定判定は次の独立PRで対応する。
- 今回のService解決変更は、利用期間/所属が操作途中に変化する全競合の新しいロック保証を追加するものではない。既存Repositoryの再検証と権限条件を維持する。
- 本番リリース、非公開Serviceのスマートフォンでの操作、実AI生成/LINEの確認は別作業。今回設定を変更しない。

## 6. 次作業へ進める条件

- 本PRのCI成功・レビュー・mainマージを確認し、投稿の採否/完了/成果のAPI対応を同じ所有境界で進める。
- production反映は別リリースとして扱う。
