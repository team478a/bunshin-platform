# P1-G AI原価計測の保存境界

2026-10-06。基準main: `9dce361ab348f2586f03890aed60fec4a67651e7`。

既存Assessment Provider、Prompt、モデル選択、Quota、再試行、評価結果の正本を維持する。PilotだけProviderの構造化measurementを受け取り、既存AiUsageEventの試行キーを共通参照とする。既存ProgramActionEventへ`PERSONAL_LEARNING_AI_CALL`を保存する。これは呼出しの事実であり、Planや評価の新しい正本ではない。schema/table/migrationは追加しない。

Eventには版付きPlan/Definition/Assignment/Answerと数値・固定codeだけを保存する。DB層で本人、5軸scope、専用Program、保存済みPlan revision/Definition対応を再検証し、Privacy削除後の再作成を拒否する。再送は同じ試行キーでimmutable、別試行は別事実。Eventは既存Training Export/削除の対象である。

価格はserver-onlyのレビュー済みJSON設定を使用し、Provider/Model/有効日時の完全一致で選ぶ。通貨はV1ではUSD、単価はmicro USD / million tokens。cached usageや単価、usageが不明ならUNKNOWNにし、欠損を0円へ変換しない。価格版と単価snapshotをEventへ固定し、過去値を現在価格で書き換えない。無効な価格設定もProviderの学習処理は妨げず、UNKNOWNと固定診断を残す。

Telemetry保存失敗はProvider再呼出し理由にしない。固定error codeで観測欠損を示し、欠損期間は原価0円や計測成功と称しない。本文、raw Error/Response、Prompt、相談、回答全文はTelemetry/logへ含めない。

波ごとの参加者数は開始承認とは別。既存1〜5人gateを解除せず、Program IDと人間管理のWave対応から集計する。100人開放、価格自動取得、Model Router、Provider追加、Definition承認、本番変更、実課金APIを行わない。
