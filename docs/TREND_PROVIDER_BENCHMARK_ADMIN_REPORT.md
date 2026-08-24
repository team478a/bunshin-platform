# トレンド調査Provider比較 管理画面実装報告

## 調査と変更

既存の管理者認証、環境分離、Grok／Exa／Firecrawl Adapter、比較評価関数を再利用し、`/admin/ai/benchmark`を追加した。比較質問と正規化済みの根拠URL、人間評価、費用、応答時間を環境別に保存する。

## 設計判断

- raw Provider responseとAPIキーは保存しない。
- 根拠はHTTPS URLと任意の公開日だけを保存し、重複、認証情報付きURL、fragmentを拒否する。
- DEVELOPMENT、STAGING、PRODUCTIONを分離する。
- 比較結果はProvider設定を自動で有効化せず、人間の採否判断で停止する。
- 同じ比較質問・Providerの結果は更新し、重複行を作らない。

## 未解決事項

実APIによる比較実行、原価の自動取得、採用Providerの決定、日次配信接続はAPIキー準備後に行う。
