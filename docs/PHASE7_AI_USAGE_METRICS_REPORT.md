# Phase 7 AI Usage Metrics 実装レポート

## 1. 調査した内容

- Strategy Generator、Weekly Planner、Daily Mission Planner
- Mission Content Generator、Quality Checker、Repair
- 各Providerが返すmodel、Prompt Version、input/output token、latency
- 現行Validation Metrics APIと管理画面

既存実装は必要な測定値をログへ出していたが、KPI集計可能な形では永続化していなかった。

## 2. 変更内容

- Workspace / Bunshin / actorで分離した`AiUsageEvent`
- 成功・失敗、task、provider、model、Prompt Version、token、latency
- nullableな見積原価とpricing version
- request単位のidempotency key
- Strategy、Weekly Plan、Daily Mission Intelligenceの記録
- Validation Metrics APIと管理画面へのAI回数・token・失敗・見積原価追加

Prompt本文、Knowledge、Memory、生成本文、API keyは保存しない。

## 3. 原価の設計判断

モデル単価は変更されるため、モデル名だけから現在価格を推測して過去データへ適用しない。`estimatedCostUsdMicros`と`pricingVersion`を同じEventへ保存し、価格根拠を確定できる場合だけ値を設定する。

未価格Eventがある場合、管理画面は原価を確定値として扱わず「未価格の実行を含む」と表示する。

## 4. Isolation / Reliability

- 記録前に対象Workspace / BunshinへのACTIVE membershipを検証
- Workspace単位の集計条件を必須化
- 同じrequest/taskの再実行はupsertで重複させない
- 計測保存障害でユーザー向け生成結果を失敗させない

## 5. DB変更

`20260821180000_ai_usage_events`

本番反映には通常のmigration deployが必要。

## 6. 未解決事項

- OpenAI公式価格版を確定したcost calculator
- cached input等を含む詳細usage分類
- 1 Active User当たり原価表示
- Provider別・task別の管理画面内訳

単価は人間レビューなしに固定しない。

## 7. 次へ進む条件

MigrationとRaw Event構造をレビューし、価格根拠とpricing version命名を決定する。次Sliceは法務同意・削除/退会、またはcost calculatorを選択できる。
