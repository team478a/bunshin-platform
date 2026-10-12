# EVO-04 原価照合の設計判断

基準main: `b4743ef7a8b2648a1e985c32cf14a1a995aacfca`（#1191 merge、main CI成功）。#1188のEVO-04計画を参照。今回の範囲は既存記録の純粋な照合契約と合成回帰であり、請求・保存・UI・本番集計を切り替えない。

- `AiUsageEvent`は共通利用履歴。Pilotの`ProgramActionEvent/PERSONAL_LEARNING_AI_CALL`は同attemptの詳細観測で、別の費用ではない。workspace/actor/usageKey完全一致で照合し、時刻・model・現在所属から相関を推定しない。
- Pilotが存在すれば保存済みmeasurementとpricing snapshotから既存`estimateAiCallCost`で検証した費用を1回だけ採用する。共通履歴と矛盾する費用・model・tokenはCONFLICT、Pilot欠測を共通額で隠さない。
- 再試行はusageKeyのattempt番号が異なるため別費用。失敗でも観測済みusageは費用を保持する。成功/失敗は二つの記録を別々に保持し、Provider成功後の処理失敗を矛盾と決めつけない。
- cached/価格版はPilot保存snapshotを維持。共通履歴だけではcached内訳を復元できず、versionなし費用はUNKNOWN。現在のregistryで過去を再価格計算しない。
- 集計母集団は入力された記録だけ。両方best-effort保存であり、両方欠けたcallは検知不能。取得打切り、矛盾、欠測なら総額/coverageを保留。既知subtotalは完全な原価・請求額ではない。
- Pilotのgroup/enrollmentは実行時明示参照。共通AiUsageEventにはgroupの実行時snapshotがなく、現在所属/Bunshinの移動/複数ServiceからOEM費用負担を推定しない。Pilot groupもOEM apiCostOwnerの証明ではない。OEM配賦は別契約レビュー待ち。
- Applicationの既存公開入口に純粋関数を追加。DB/Provider依存なし、新package/schema/価格/認可/Admission変更なし。実DB読取APIや価格変更・予算・請求への接続は別承認。
