# AI研修 読み取り専用保持期限管理画面 実装報告

## 1. 調査

main `c79af405`（#999）を基準とした。既存PreflightはCron Secretによる内部POSTだけで、サービス管理者が画面から件数を確認する導線はなかった。既存Repositoryの期限判定・Scope/所有境界・最大100受講/1000Program・RepeatableReadを再利用する。

## 2. 変更ファイル

- capability-training/personal-data-retention.ts: 認証済み管理者のScope/結果契約。
- database/training-retention-preview.ts、index: 共通の読み取り集計と管理者認可付き公開Repository。
- `/s/[serviceSlug]/manage/training/retention` のPageとSummary、既存研修管理画面の入口。
- Database Unit/Integration、Web実Page/UIのテスト。
- D-138、ロードマップ、本報告。

## 3. 設計判断

Service Slugとログイン本人からScopeを解決し、DBの同一RepeatableRead TransactionでACTIVEなSERVICE_OWNER/ADMIN、User、Group、Workspaceを再検証する。CONTENT_EDITOR、一般参加者、所属失効、別Scopeは拒否。Cron Secretの公開や内部APIの流用はせず、既存Preflightの認証契約を維持する。

結果は回答/評価・仕事Profile・点数Profile・進捗Snapshotの期限件数、保持Toolkit、終了日不明・所有境界不明の集計のみ。個人名、本文、評価、仕事情報、点数、Toolkit本文を取得しない。終了日を推定・補完しない。対象受講数は人数ではなく、カテゴリ件数は合算不可、Toolkitは保持全件数と明示する。

ページはdynamicで毎回サーバー時刻を使い、確認時刻を日本時間で示す。入口のprefetchを無効にし、再確認は通常のページ再読込とする。上限超過は全件不明と表示し、部分集計や0件成功へ置き換えない。DB障害時は安全なエラーコードだけを記録し、一般案内を表示する。認可失効は404で、Scope解決の実障害は隠さない。

## 4. 検証

- Web関連4ファイル42テスト成功：実PageのScope、ログイン、認可、DB失効、上限、障害表示、例外文非公開、既存Cron/実行API・Dashboard回帰、単位・保持ルール・非破壊案内。
- DB Preflight/Admin Preview 12テスト成功：同一TransactionのRole/Scope、有効状態、上限、障害伝播、既存期限・所有境界・Toolkit保持。
- 実PostgreSQL統合に管理者のみの集計、一般参加者・別Workspace/Group・CONTENT_EDITOR・失効管理者拒否、個人回答非破壊の検証を追加する。
- 全体format/typecheck/lint/test/build、Prisma/migration/readiness/実DB統合の最終結果は対象PRのCIを正とする。

## 5. 未解決事項

Schema/Migration、API書込、Provider、LINE、Cron登録、本番操作を変更しない。既存の本番期限処理API停止は維持する。終了日不明の記録への入力/補完、100受講を超えるページ分割は未実装。この画面の確認を削除の実行承認と扱わない。

## 6. 操作・次へ進める条件

サービス管理画面の「AI研修の進み具合」から「研修データの保持期限を確認」を開く。保留がある場合は件数0でも確認完了と判断しない。Backup・外部Provider・保存済みExportの完全消去を保証しない。

人間レビューと最新HEADの全CI成功後にマージ可能。本番反映、Service管理者・一般参加者の実アカウント確認は別途必要。本番削除の有効化には対象Scope/起算日/停止復旧/証跡の確認と別途承認が必要。
