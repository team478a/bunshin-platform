# AI Provider原価UNKNOWN fail-closed

## 1. 調査した内容

本番のread-only監査では、OpenAIの`AiUsageEvent`が当日21件、当月1,001件あり、成功を含む全件で`estimated_cost_usd_micros`がNULLだった。既存Runtime予算判定は既知原価の合計だけを参照するため、表示使用額0でも当月残予算を保証できない。

`AiUsageEvent`にはProvider送信済みを確定する列がなく、status、task type、error codeによる除外では費用未発生を証明できない。既存のUNKNOWNアラートは可視化でありRuntime停止条件ではない。

## 2. 変更したファイル

- `packages/application/src/ai-provider-configuration.ts`
- `packages/application/test/ai-provider-runtime-guard.test.ts`
- `packages/database/src/provider-configurations.ts`
- `packages/database/test/provider-configurations.test.ts`
- `apps/web/test/ai-runtime-provider-configuration.test.ts`
- `docs/DECISION_LOG.md`
- 本報告

DB schema、migration、Provider実装、モデル、価格、本番設定は変更しない。

## 3. 主要な設計判断

既存monthly budgetと同じUTC月次・Provider単位の範囲で原価NULL件数を数える。1件以上ならactive Provider Runtime解決を`CONFLICT`で停止し、API key復号やProvider Adapter到達より前にfail-closedとする。

日次にNULLがなくても当月予算残高は確定できないため、日次だけの判定にはしない。既知のDaily Missionや送信前失敗を推測除外せず、UNKNOWNを0円または安全へ変換しない。

既存Eventのbackfill・削除や自動解除は行わない。記録経路ごとの確定原価保存は別PRとし、本変更のproduction反映は既存共有AI機能への停止影響を人間がレビューした後の別承認とする。

## 4. 実行した検証

- application全体: 136 files / 900 tests成功。
- database全体（integration除外の標準package test）: 197 files / 952 tests成功。追加Repository集計テストを含む。
- Web関連: `ai-runtime-provider-configuration.test.ts` 1 file / 14 tests成功。原価UNKNOWN時にAPI keyを復号せず停止する回帰を含む。
- application / database typecheck成功。Web buildのNextコンパイルとTypeScript検査は成功。
- application / database build成功。
- 変更TypeScriptのESLint、変更全ファイルのPrettier、`git diff --check`成功。
- Web全体testは463 files / 3,262 tests成功後、既存3 suiteがPrisma Clientの`#main-entry-point`解決失敗、既存terminology test 1件が5秒timeoutで失敗した。関連Webテスト単独は成功。
- Web buildはコンパイル・TypeScript成功後、page data収集で同じ既存Prisma Client解決失敗により未完。成功扱いにしない。

## 5. 未解決事項

- 現行のProvider別利用記録にはenvironment列がなく、既存予算集計と同じ共有境界を維持する。
- 既存の当月UNKNOWNが残る環境へ反映すると、UTC月替わりまたは確定原価を記録する経路の修復までProvider Runtimeが停止する。
- Provider側budget、請求照合、外部通知、停止/drain、実課金上限は別Gate。

## 6. 次Phaseへ進める条件

PRレビューとCI成功後も自動でproductionへ反映しない。既存機能の停止影響、UNKNOWN発生経路の修復順序、Provider側budgetと通知を確認し、限定releaseを別承認する。Pilot START、Provider送信、実課金はさらに別承認とする。
