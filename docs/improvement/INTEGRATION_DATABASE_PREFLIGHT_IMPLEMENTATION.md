# DB統合試験: 破壊的前処理前の隔離preflight

## 結論・対象

2026-10-03 Asia/Tokyo、PR #1100 merge後main `c5d0eeba8fc36e7e94ba25f6e2dede002d8dcc95` を基準とする。同PRの最新head `bab6bba55ee8fbef99e923dca31f08bf4a2f6a2d` のverify/database CI成功も確認した。

`database.integration.test.ts` のURL substringガードを廃止し、明示的な使い捨て接続先とread-onlyの実DB識別を検査する。所有境界と認証return attemptの**両方**のsuiteに適用し、既存fixtureの `deleteMany` / createより先に完了させる。不正設定はskipでなく失敗にする。本番の認可やセキュリティを実装する仕組みではなく、テスト実行者の誤接続を防ぐpreflightである。

変更はテスト3ファイルと報告/ロードマップのみ。アプリ、Repository、DB schema/migration、依存、lockfile、CI/CD、本番設定を変更しない。既存fixture cleanupのFK順序問題は別タスクとし、このPRに混ぜない。

## 設計

- `NODE_ENV=test`、`APP_ENV=development` を必須とし、DATABASE_URLとDIRECT_URLは完全一致でなければ拒否する。URLをparseし、postgresql scheme限定、query/hashを拒否。接続文字列やraw driver errorをエラーメッセージへ出さない。
- ローカルは `127.0.0.1:18998`、postgres user、16文字以上の合成パスワード、run IDに一致する `bunshin_disposable_<runId>` のDB名だけ。run IDは `BUNSHIN_TEST_RUN_ID` の12〜32桁lowercase hex。CI/GitHub flagがある場合はローカルmodeに戻さない。
- ローカルDBには作成者が明示するdatabase comment `bunshin-disposable-test:<runId>` が必要。live queryで `current_database()` とcommentを照合し、未指定/別run/別DB/読取失敗なら書込前に停止する。
- 既存GitHub Actionsのservice lifecycleは別modeで維持する。`GITHUB_ACTIONS=true`、`CI=true`、本repo、正規run ID/attemptと**現行CIに定義された完全一致URL** `postgresql://postgres:postgres@localhost:5432/bunshin_platform_test` のみ許可。live DB名も照合する。CI設定を変えず、外部DBや別repoの任意CIへ広げない。
- env flag/commentは悪意ある実行者への防御ではない。CIの一時serviceという根拠は現行workflowに依存し、将来workflowが外部DBへ変われば再レビューが必要。localhostのport forwarding、マーカーを付けた顧客DB、コピーされた本番DBは許可された使い方ではない。資格情報/実行者の管理とrun単位の一時container確認は引き続き必須。
- ガードは統合試験の前処理を対象とし、`db:migrate:deploy` 自体の誤実行や任意socket通信を防ぐものではない。migration実行前は別途、今回作成した一時container/loopback publish/接続先を照合する。

## ローカルの再実行手順

既存cached PostgreSQL16を使用し、run IDごとに新しい一時container/DBを作る。`--pull never`、loopback publish、host bind mount/共有volumeなし、`--rm`。本番や以前の作業DBを使わない。前回のfixtureが残る同一DBを使い回さない。

1. task label、完全container ID、loopback port、DB名を照合する。
2. process内だけにNODE_ENV/APP_ENVと両DB URL、BUNSHIN_TEST_RUN_IDを設定。既存資格情報をコピーしない。ローカルCI/GITHUB_ACTIONS flagは設定しない。
3. 一時DBに既存migrationを適用し、DB作成者がそのDBに上記commentを設定する。comment付与は隔離済みDBを確認してから行い、ガードを通すために既存DBへ付けない。
4. 次の既存コマンドを実行する。

```text
pnpm --filter @bunshin/database test:integration
```

5. 終了後、task label/完全IDを再照合して当該containerだけをstopし、専用networkも除去。共有pruneや他containerの停止はしない。CIは現行の専用serviceと既存コマンドをそのまま使用する。

## 今回の検証

Windows / Node24.21.0 / pnpm10.10.0 / Vitest4.1.11 / Docker29.8.0、既存postgres:16 image。ローカルrun ID `a3b8d10e472f`、一時DB `bunshin_disposable_a3b8d10e472f`。本番DB/資格情報/ユーザー素材、Provider、Storage、LINEは使わない。

- `pnpm --filter @bunshin/database exec vitest run test/integration-database-preflight.test.ts`: 37件成功。ローカル/CI正常、環境/URL不一致、外部・lookalike host、query指定、別DB/run、未知CI、live marker不一致/読取失敗と診断の秘密非表示を確認。
- 開発中に第2 suiteの旧 `integration` alias残存をtypecheckが検出。修正前の実DB起動もReferenceErrorで失敗し、これはガード成功の証拠として扱わない。第2 suiteもdescribeとlive preflightへ接続後に再実行した。assertionの削除/skip/期待失敗指定はしていない。
- 既存226 migrationを空の一時DBに適用: 成功。
- markerなしの実DBに合成User sentinelを1件作成し、`pnpm --filter @bunshin/database exec vitest run test/database.integration.test.ts` を実行: **preflight拒否で2 suite失敗、86件は前処理後未実行**（runner表示skipped）。実際の拒否エラーと非zero exitを確認し、User sentinelが1件のまま保持されたことをpsqlで確認。ReferenceErrorによる初回失敗と区別する。これは拒否試験の成功であって統合86件の成功ではない。
- 正規commentを設定した同じ一時DBで既存 `test:integration` を実行: 86件すべて成功（開始20:50:13 JST、46.05秒）。拒否時の86件未実行とは区別する。既存の認可/競合/失効/retention/maintenance/auth return attempt回帰は変更していない。
- 型チェック成功。lint初回はfakeのawaitなしasync arrow4件で失敗し、Promise.resolve/rejectへ変更して37件を再実行し全件成功、最終lintも成功。動作/assertion/拒否条件は弱めない。architecture/変更ファイルformat/diff check成功。
- 検証後はtask labelと完全IDを照合して専用containerをstopし、`--rm` により合成DB/匿名volumeを除去。専用networkも除去し、当該task labelのcontainer/networkが残らないことを確認。共有prune/他containerの停止なし。

関連検証コマンド:

```text
pnpm --filter @bunshin/database exec tsc --noEmit
pnpm --filter @bunshin/database exec eslint test/integration-database-preflight.ts test/integration-database-preflight.test.ts test/database.integration.test.ts
pnpm architecture:check
pnpm exec prettier --check packages/database/test/integration-database-preflight.ts packages/database/test/integration-database-preflight.test.ts packages/database/test/database.integration.test.ts docs/improvement/INTEGRATION_DATABASE_PREFLIGHT_IMPLEMENTATION.md docs/IMPLEMENTATION_ROADMAP.md
git diff --check
```

最新head全体CIの結果はPRに記録し、過去headの成功を流用しない。

## 残課題・切り戻し

次の最小タスクは**使い捨てDBで既存fixtureの前処理順序を再現し、2回連続実行のFK失敗をテスト専用PRで修正すること**。現在のguardを通ってもfixture cleanupが完全とは保証しない。より広い自動再試行/既存DB利用を許可しない。

その後の実Supabase Auth＋実Next＋実DB＋browser E2Eは別の未完タスク。Auth runtimeの取得・合成アカウント・ネットワーク制限を承認確認してから開始する。preflightやDB試験成功は実認証E2E/本番公開の証拠ではない。

切り戻しはテスト/helperと文書だけを戻せるが、substringの旧ガードが再発する。アプリ/本番データに変更なし。本番NO-GO、旧worker停止/drain/preflight/backup復元後再削除のgateは維持する。課金、実生成、実送信、merge/deployは実施しない。
