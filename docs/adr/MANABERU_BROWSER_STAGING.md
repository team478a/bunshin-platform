# ステージングで受講要望から教材生成を検証する

Web、候補選択 API、ワーカー、教材ジョブ、原価レポートは同じ `APP_ENV` を使う。ステージングのジョブは `STAGING` で登録・処理する。既存の Program の操作教材設定、候補選択 API の Workspace 設定、Provider の予算を使う。本番の受付・実行は対象外とする。

ステージングには開発・本番と分離したデータベース、認証プロジェクト、証拠出力先、専用の Provider 設定と暗号化キーを使う。既存の `BrowserFixtureRecipe`、教材、AI 利用記録には環境列がないため、同じデータベースを複数の環境で兼用しない。

1. ステージングの DB に既存の migration を適用し、検証用 Program の操作教材を有効にする。
2. Web と Docker ワーカーを `APP_ENV=staging` で起動する。Web に `BROWSER_FIXTURE_MODEL_SECRET` と `BROWSER_FIXTURE_MODEL_WORKSPACE_ID`、ワーカーに同じシークレットと Web の HTTPS オリジン `BROWSER_FIXTURE_MODEL_ORIGIN`、専用 DB の接続先 `BROWSER_FIXTURE_DATABASE_URL` を設定する。Web の Provider は `STAGING` の設定と対象モデルの単価を使う。
3. Docker ワーカーは既存の `serve` を使う。ワーカーの証拠保管先 `BROWSER_WORKER_OUTPUT` はステージング専用とする。
4. 実認証の受講者で登録、教材表示、再利用を確認する。同時に別環境のジョブが対象外であることを確認する。

この手順で使う操作対象は既存の検証用カタログと練習用メモ。
