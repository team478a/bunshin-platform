# 非公開サービスの投稿パートナー操作 修正報告

日付: 2026-09-29。基準: main `3e57e72b`。対象は機能不足監査後の第1作業単位。コード修正・検証は本番反映の証拠ではない。

## 1. 調査した内容

- 投稿パートナーの画面は既存`resolveMemberServiceContext`を使うが、一覧・作成・取得・編集・停止のHTTP APIは公開Slug解決を使っていた。非公開Serviceの既存参加者は画面を開けても操作が404になる。
- 初回回答済みユーザーが使う候補提案APIにも同じ公開判定が残っていた。候補から選んだ投稿パートナーの保存は共通の作成APIを使う。
- Repositoryの一覧・取得はService所属時に本人所有を必須としていたが、編集/停止はWorkspace OWNER/ADMINの他人操作を許可し得る条件だった。実際の不正操作や本番データ漏洩が発生したという調査結果ではない。

## 2. 変更したファイル

- `apps/web/src/http/service-bunshins.ts`: 認証済みUserを先に取得し、本人のMember Service解決を全5操作に使用。
- `apps/web/src/http/service-bunshin-proposals.ts`: 同じMember Service解決で初回回答からの候補作成を接続。
- `packages/database/src/bunshin-core.ts`: Service所属Bunshinの編集/停止に本人所有条件を追加。
- WebのHTTP実行テスト2件と境界テスト2件、DBのRepository実行テスト・境界テスト・既存DB統合テストを追加/更新。
- Decision Log D-148、Roadmap、機能不足監査、この報告書を更新。

## 3. 主要な設計判断

- 公開状態は匿名入口の判定に残し、既存参加者の操作認可には使わない。既存Resolverによる利用期間、ACTIVE Workspace/Group/本人所属の検証を再利用する。
- Workspace/Service/操作者はURLと認証からサーバーで解決し、作成/編集の厳格Schemaで任意IDの追加を拒否する。所属Bunshinの参照・変更は指定Scopeと本人所有を条件にする。
- Repositoryの既存所属再検証と同一Origin検証を維持する。個人用BunshinのOWNER/ADMIN権限は変更しない。
- 候補提案は当該Serviceの本人所属から回答・事業プロフィールを取得し直す。共通Userプロフィール、他Service回答、任意の回答入力へ切り替えない。既存AI/fallback処理を変更しない。
- DB schema/migration、公開登録、Metadata、設定、LINE配信、実Provider呼出、本番データは変更しない。

## 4. 実行した検証

- Web対象5ファイル: 53テスト成功。非公開参加者の全5操作、認証前の参照拒否、Scope解決拒否、他Service切替、Repository所有拒否、ID注入・異Origin拒否、候補提案fallbackを含む。HTTPテストは認証/Resolver/Repository Portをmockし、Application Use Caseは実装を使用する。
- DB対象2ファイル: 19テスト成功。Service所属の本人限定変更、Workspace管理者の他人操作拒否、他Scope拒否、個人用管理権限維持を含む。RepositoryテストはPrisma Clientをmockして実装のQuery条件と処理を検証する。
- 実DB統合テストに同じServiceに参加したOWNER/ADMIN/本人、別Service、所属取消後の編集/停止拒否を追加。ローカルの本番DBには実行せず、CIの隔離PostgreSQLで検証する。
- 全Webテスト390ファイル/1,966件、DB非統合テスト170ファイル/647件が成功。Web/DB型検査、変更コードlint、format、アーキテクチャ境界検査と境界検査自体の10テスト、`git diff --check`も成功。全体lint/buildと実DB統合はPRのCIで確認する。

## 5. 未解決事項

- SNS設定・投稿テーマ・週間計画の操作APIに残る公開サービス限定判定は後続の独立PRで対応する。
- 投稿採否・完了・実行結果の保存APIはその次の作業単位とする。
- 本番へのリリースと非公開Serviceの実利用者によるスマートフォン操作確認は別途必要。設定変更や実AI/LINE呼出は今回実施しない。

## 6. 次作業へ進める条件

- 本PRの検証成功・レビュー・mainマージを確認してから、同じ所有境界を保ったSNS設定等のAPI対応へ進む。
- 本番適用はproductionリリースを分け、mainマージのみで本番稼働済みと扱わない。
