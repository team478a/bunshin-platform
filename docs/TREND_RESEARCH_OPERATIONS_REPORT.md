# トレンドリサーチ運用基盤 実装報告

## 完了した範囲

- ACTIVE SOCIALと承認済みSNS戦略を対象にした週次候補抽出
- Workspace・Bunshin・SocialProfile・週単位の冪等Job
- Job実行直前の所有権・Membership・Capability・Profile・Strategy再検証
- Grok、Exa、Firecrawlの管理画面設定からのProvider選択
- 日次・月次予算到達時のProvider停止
- Research Run、Evidence、Candidateの期限切れ処理
- Provider障害時にトレンドなしの通常Missionを継続するfallback
- 調査1回原価の管理設定とAI Usage／管理KPIへの記録
- 認証、回数制限、quota、network、Provider障害、応答不正の分類

## 実行方法

既存の`/api/internal/jobs/schedule`が毎週月曜00:00 UTCに`TREND_RESEARCH_REFRESH`を登録し、既存Workerが処理する。同じ週の同じSocialProfileには同じidempotency keyを使うため、CronやWorkerの再実行で重複調査しない。

## Provider設定

APIキー、モデル、日次・月次予算、調査1回の原価は環境別の管理画面で版管理する。接続確認済みかつACTIVEで、停止されておらず予算内の設定だけを利用する。APIキーがない環境でもJob、隔離、期限切れ、fallbackを自動テストできる。

## データ境界

候補抽出と実行前確認の両方でWorkspace、User、Bunshin、SocialProfileを固定する。他Workspace、他User、他BunshinのStrategy、Pillar、Evidence、Candidateを検索入力またはMission入力へ渡さない。

## 障害時の動作

一時的なrate limit、network、Provider障害はJob再試行対象とする。認証不備、設定なし、予算到達、scope失効は再試行しない。利用可能なTrend Candidateがない場合、既存Daily Mission生成は通常の戦略・計画だけで継続する。

## 運用で残る作業

本番で利用するProvider、APIキー、モデル、料金表に基づく1回原価を管理画面へ登録し、接続確認後に有効化する。実データによる品質、原価、採用率、投稿完了率の評価は運用開始後に行う。
