# Grok Xトレンド調査Provider 実装報告

## 採用目的

X上で増え始めた投稿、会話、スレッドをトレンド企画の根拠候補として取得する。Grokに未来予測や投稿成果の保証はさせない。

## 実装内容

- 管理Providerへ `GROK` を追加
- 環境別・版管理・暗号化・接続確認・予算ガードへの対応
- 管理画面でのAPIキー、モデル、予算設定
- xAI Responses APIの `x_search` Adapter
- X引用URL、要約、利用したX Search回数の共通証拠形式への変換
- 日付範囲と最大探索回数の制限

## Providerの役割分担

- Grok: X上のリアルタイムな兆候
- Exa: Web全体の関連情報探索
- Firecrawl: Webページ本文の取得
- OpenAI: 複数根拠の評価と投稿企画への変換

## 未実装

Grok Adapterを日次トレンドJobの既定Providerにはしない。APIキー準備後にGolden DatasetでExa・Firecrawlと比較し、X向け企画で有効性と費用が確認できた場合だけ選択対象へ加える。
