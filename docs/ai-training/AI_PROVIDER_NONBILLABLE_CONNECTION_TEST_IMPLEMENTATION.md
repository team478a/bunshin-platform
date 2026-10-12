# AI Provider非課金接続確認 実装報告

## 1. 調査した内容

main `4cc9a4a1`（PR #1223）を基準に、管理Provider設定の接続確認Adapterを確認した。OpenAI／Grokはmodel参照、Creatomateはtemplate一覧、FAL／Runwayは存在しないrequest参照を使う一方、Exaは`POST /search`、Firecrawlは`POST /v2/scrape`を実行していた。後者2つは本番処理そのもので、接続確認だけでもProvider利用・未計上費用が発生し得る。

公式仕様では、Exaに認証済みチーム情報を返す`GET /v0/teams/me`、Firecrawlに認証済みチームの残クレジットを返す`GET /v2/team/credit-usage`があることを確認した。

## 2. 変更したファイル

- `apps/web/src/ai/secure-provider-configuration.ts`
- `apps/web/test/provider-connection-adapters.test.ts`
- `docs/ENVIRONMENT_CONFIGURATION.md`
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- 本報告

## 3. 主要な設計判断

Exa／Firecrawlの接続確認をread-onlyなGETへ変更し、request body、検索query、scrape対象URLを送らない。既存のtimeout、HTTP status分類、秘密復号、管理者認可、接続結果監査、有効化前の成功必須条件は維持する。

接続確認が証明するのは、保存された鍵で認証endpointへ到達できたことだけである。検索・scrapeの権限や品質、残高十分、Provider側budget、Runtime予算、実送信成功はPASSにしない。

schema、migration、価格、予算、active設定、実鍵、本番環境は変更しない。本番接続テストとProvider送信は実行しない。

公式仕様:

- [Exa OpenAPI](https://exa.ai/docs/exa-spec.yaml)
- [Firecrawl v2 OpenAPI](https://docs.firecrawl.dev/api-reference/v2-openapi.json)

## 4. 実行した検証

- Provider接続Adapter: 1 file / 8 tests成功
- Web型検査成功
- Web全体テスト: 467 files / 3,276 tests成功、2 files / 2 tests skipped
- 全体lint成功（変更対象外の既存warning 1件）
- 全package build成功（Next.js compile、TypeScript、34 static pages生成を含む）
- 変更ファイルlint、Prettier、`git diff --check`成功
- 最終CIはPR提出後に確認する。

## 5. 未解決事項

- 共有Providerの同時呼出には原子的な費用予約がなく、並行処理による予算超過余地が残る。
- Provider側budget、請求照合、外部通知は別課題。
- 実鍵で各read-only endpointが許可されることは本番で未確認。UNKNOWNをPASSにしない。

## 6. 次Phaseへ進める条件

PRレビューとCI成功後もproductionへ自動反映しない。release、接続テスト実行、設定変更、Provider送信、実課金、Pilot STARTはそれぞれ別承認とする。
