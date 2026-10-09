# EVO-02 Weekly / Strategy transport safety

2026-10-09。基準main: `d761d233d33274c3e1010a0bd15958d796b5e346`。
EVO-01 #1189のマージ後、ユーザーの「進めてください」を本作業の承認とする。
#1188の監査計画とEVO02_HANDOFFを参照。#1188自体は未マージであり、このPRへ取り込まない。

## 実装前の判断

- Weekly / Strategy Adapterのみに変更を限定する。既存`readMissionProviderResponse`と`missionTransportFailure`を再利用し、共有helper / Core / 認可 / quota / Jobを変更しない。
- Dailyと同じ55秒のAbortSignalをfetchへ渡す。ヘッダー取得だけでなく応答本文読取にも同じsignalが有効。実ネットワークの送信済み処理や課金の取り消し保証ではない。
- HTTP status、bounded provider error code、TIMEOUT / NETWORK_ERROR等だけをcauseへ残す。raw response、例外メッセージ、秘密値を保持しない。未完了・空・不正JSONは成功へ変換しない。
- モデル、Prompt、入力、Structured Outputs schema、store:false、usage欠損時nullを維持。ドメインの構造・品質検証は既存Use Caseの責務。
- Adapterは1回だけfetchする。Weeklyの既存Job分類（insufficient_quota / 4xxは原則非再試行、429 / 5xx / timeoutは上限付き再試行）と冪等保存を再利用。Strategyに自動再試行を追加しない。新しいcredit/spend系codeの追加対応は本作業へ含めず、未解決事項として報告する。
- 実API、キー作成、モデル変更、DB/schema/migration、deploy、mergeは行わない。EVO-01合成評価成功は実モデル品質の保証ではない。

参考: [公式OpenAI error codes](https://developers.openai.com/api/docs/guides/error-codes)。レート制限とquota不足を区別し、再試行を新たに重ねない。既存Jobの分類・backoffは変更しない。
