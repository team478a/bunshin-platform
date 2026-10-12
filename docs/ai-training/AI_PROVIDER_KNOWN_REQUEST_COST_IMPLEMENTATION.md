# 共有AI Provider 固定リクエスト原価Gate 実装報告

## 1. 調査した内容

main `5ae62619`（PR #1220）を基準に、共有Provider Runtime、管理設定の作成/接続確認/有効化、旧OpenAI環境変数fallback、利用記録経路を確認した。PR #1220は当月に原価NULLがあればRuntimeを停止するが、原価0のactive設定と旧fallbackは新しい利用記録を原価NULLで保存できた。

管理設定のDraft作成は鍵や原価の準備前にも必要であり、作成時点の0を確定価格とは扱えない。送信可能状態へ移る有効化とRuntime解決が安全境界となる。

## 2. 変更したファイル

- `packages/application/src/ai-provider-configuration.ts`
- `packages/application/test/ai-provider-runtime-guard.test.ts`
- `packages/database/src/provider-configurations.ts`
- `packages/database/test/provider-configurations.test.ts`
- `apps/web/src/ai/runtime-provider-configuration.ts`
- `apps/web/test/ai-runtime-provider-configuration.test.ts`
- `docs/ENVIRONMENT_CONFIGURATION.md`
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- 本報告

## 3. 主要な設計判断

原価値をコードで推測せず、`requestCostUsdMicros`が正の安全な整数の場合だけactive Runtimeを返す。既存の原価0 active設定もAPI key復号前に`CONFIGURATION_ERROR`で停止する。

新しいDraftは従来どおり原価0で準備可能とする一方、DB transaction内の有効化で正の原価を再確認し、既存active設定の無効化や監査追記より前に拒否する。

管理設定が存在しない場合だけ使う旧OpenAI fallbackには、`OPENAI_REQUEST_COST_USD_MICROS`を追加する。未設定、0、負数、小数、安全な整数範囲外はProvider送信前に拒否する。モデル互換性検査は維持する。

過去Eventのbackfill/削除、価格値、schema/migration、Provider、管理設定、本番環境は変更しない。

## 4. 実行した検証

- Applicationテスト: 136 files / 902 tests 成功
- Database非integrationテスト: 197 files / 953 tests 成功
- 関連Webテスト: 2 files / 20 tests 成功
- Web全体テスト: 465 files / 3,270 tests成功、2 files skipped。並列全体runで既存の重い3件が5秒timeoutになったが、該当2 files / 12 testsの単独再実行は成功
- Application / Database / Web型検査
- 全package build成功（Next compile、TypeScript、34 static pages生成を含む）
- 変更ファイルlint / format、`git diff --check`

最終CI結果はPR上で確認する。

## 5. 未解決事項

- 正しい固定原価値と価格versionは運用責任者の確認が必要。今回値を設定しない。
- 既存の当月原価UNKNOWNは変更せず、PR #1220の月次fail-closedが継続する。
- 旧fallbackには管理Provider設定のような日次/月次budget集計がなく、移行終了または別Admissionが必要。
- 管理画面の接続テスト自体のProvider費用、同時呼出による予算予約、Provider側budget/請求照合は別課題。

## 6. 次Phaseへ進める条件

PRレビューとCI成功後もproductionへ自動反映しない。対象Provider/modelの承認済み原価、既存UNKNOWNの扱い、共有AI停止影響、fallback利用有無を確認する。production release、設定変更、Provider送信、実課金、Pilot STARTはそれぞれ別承認とする。
