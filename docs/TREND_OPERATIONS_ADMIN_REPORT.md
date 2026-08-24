# トレンド企画 運用管理レポート

## 1. 調査内容

既存の`TrendResearchRun`、`TrendEvidence`、`TrendIdeaCandidate`、`MissionTrendContext`、`MissionDecision`、`MissionActivity`、`PostRecord`を確認した。運用KPIに必要なRaw Eventは既存DBにあり、Schema追加は不要と判断した。

## 2. 実装範囲

- 管理者専用の`/admin/trends`
- 期間別の調査成功・失敗、企画候補、安全確認、平均鮮度
- トレンド企画の作成、採用、コピー、投稿完了と割合
- 利用可能・期限切れEvidence、Provider別の調査・失敗、失敗分類
- 実費未計測とProvider比較参考原価の分離表示

## 3. 設計判断

- 集計QueryではMission本文、候補本文、Evidence要約、Activity metadata、個人情報を取得しない。
- Platform AdminがACTIVEの場合だけ集計し、未認可時は存在自体を隠す。
- 採用率・投稿率は、期間内に作成された`MissionTrendContext`を母数とする。
- 調査Runに実原価が保存されていないため、0円とは表示せず「未計測」とする。
- Provider比較の保存原価は本番実費ではないため、参考値として別表示する。

## 4. DB変更

なし。

## 5. 未解決事項

本番Providerを採用して週次調査を外部接続する際に、Provider、使用量、実原価、latencyを本文なしのRaw Eventとして保存する必要がある。それまでは実原価を確定値として扱わない。
