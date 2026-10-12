# EVO-01から次工程への引継ぎ

EVO-01終了後に停止する。以下は候補であり、着手・本番利用・有償API比較の承認ではない。

## 優先候補

1. #1188監査PRとEVO-01を人間レビューし、固定fixtureのoracle、負例、未測定項目を確認する。
2. 監査計画のEVO-02でProvider timeout/error handling等の安全境界を小さなPRとして検討する。今回Runtime変更を先取りしない。
3. モデル/Prompt更新が必要になった時点で、費用上限・実API実行権限・候補モデル・評価条件・人間Rubricを別途承認し、固定条件の実評価を追加する。

## 再利用するもの

Goal/Plan/Router、既存Daily品質Gate、Weekly検証、Assessment/Skill Rule、Pilot/Provider直前認可、Call Admission、Cost Telemetry、tenant分離はそのまま維持する。

今回の評価データとreport形式は実モデル比較の準備であって、外部モデルを自由に接続するGatewayではない。現在のrunnerは固定出力専用。model labelだけを書き換えてもモデルの性能比較にはならない。

## 未測定・限界

- 実モデルの意味的品質、latency、token、原価、エラー率。
- 合成文字列oracleを越える創作/個別最適化の妥当性。人間レビューが必要。
- 実認証・契約・Production Pilot・実tenant分離。既存mock回帰成功を本番PASSにしない。
- Weekly/Dailyの意味的一貫性は少数fixtureの期待語句まで。万能意味判定ではない。
- Dailyの評価はBrief Adapterと固定投稿bodyの品質Gateまで。本文生成を新規実装/呼出ししない。
- 本人能力はUNKNOWNの維持を確認しただけ。Capability Level engineや本人の実操作検証を作らない。
- 人間reviewファイルは承認記録形式のみ。信頼できるレビュアー権限・署名・本番承認システムではない。

## 次の実評価PRの受入条件候補

- offlineとreal APIのreport modeを混同しない。実測値の取得失敗はUNKNOWN。
- 同一dataset/rule/ケース集合で比較。変更時は新baselineの人間承認。
- Provider設定/本番モデルを評価のために書き換えない。
- 必須違反があれば候補モデル採用不可。比較品質が良くても相殺しない。
- raw answer/request/response、顧客情報、keyをレポート・外部レビューへ送らない。
- latency/cost比較は反復回数、usageの正本、pricing version、timeout/retryを明記。
- 模擬負例の検出成功を実モデル品質保証にしない。merge/deployは別の人間承認。
