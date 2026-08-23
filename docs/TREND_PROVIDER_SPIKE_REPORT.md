# トレンド検索Provider比較spike

## 結論

本番Providerはまだ確定しない。共通契約とExa／Firecrawl Adapterを用意し、外部接続なしで安全な変換と失敗分類を検証した。実キーを使う比較は、人間が費用上限とDEVELOPMENT限定接続を承認した後に行う。

暫定の第一候補はExaとする。公開日時、短い根拠、検索時のmoderationを1回の検索契約で扱いやすいためである。FirecrawlはWebページ取得を重視する場合の比較候補として残す。この判断は日本語検索の実測前なので確定ではない。

## 今回作った境界

- Coreには`TrendResearchProviderPort`だけを置き、Provider SDK型を持ち込まない。
- AdapterがProvider応答をURL、題名、公開日時、最大3件の短い根拠へ変換する。
- HTTP以外、認証情報付きURL、fragment、根拠のない結果を捨てる。
- raw response、本文全文、APIキー、利用者識別子を保存・記録しない。
- 認証、回数制限、残高、通信、Provider障害、壊れた応答を固定分類する。

## 比較

| 観点         | Exa                                      | Firecrawl                               |
| ------------ | ---------------------------------------- | --------------------------------------- |
| 主な強み     | 意味検索、公開日指定、検索と短い根拠取得 | Web検索とページ内容取得、消費credit取得 |
| 鮮度指定     | `startPublishedDate`                     | 日数の時間フィルター                    |
| 根拠の渡し方 | highlights                               | description／短く切ったmarkdown         |
| 原価観測     | 今回の応答契約では不明                   | `creditsUsed`を取得可能                 |
| 日本語品質   | 実キーによる同一query比較が必要          | 実キーによる同一query比較が必要         |
| 暫定用途     | Evidence中心の第一候補                   | ページ取得が必要な比較候補              |

YouTube固有の動画調査は、Web検索の代用ではなく公式YouTube Data API用の別Adapter候補とする。TikTok Research APIは商用MVPの標準Providerにしない。

## 本番採用前の確認

1. DEVELOPMENT環境だけに一時キーを登録する。
2. 同じ日本語queryセットで鮮度、出典品質、欠損率、時間、1調査当たり費用を比較する。
3. 個人情報やKnowledge本文をqueryへ含めないことを確認する。
4. 月額・1回・1日上限、timeout、停止条件を決める。
5. 採用判断をADRへ記録してからJobやMission生成へ接続する。

本spikeではAPIキー登録、外部API実行、課金契約、本番Job、Mission生成への接続を行っていない。
