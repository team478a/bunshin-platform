# 2026-10-10: Learning Definition承認UIは既存APIへ1件ずつ接続する

状態: Proposed（実装PRの人間レビュー待ち。本番操作は未実施）

3件の教育設計への人間承認と、本番の承認登録・Pilot開始を区別する。直接SQLやCookie転記ではなく、既存管理者sessionと同originの承認APIを利用する最小画面を追加する。

- 既存LearningDefinitionApproval / ProgramAuditLog / definition-approvals APIを再利用。schema、Rule、Definition、Mission、Router変更なし。
- 自ServiceのSERVICE_OWNER / SERVICE_ADMINのみ。既定無効flag、固定準備authority、停止・DB再認可・CAS・idempotencyを維持。表示判定は認可の代替ではない。
- 初期表示はHTTP読取/書込なし。明示GET後に1件を選び、7項目・対象commit・本文なしの証跡キー・最終確認を人間が入力する。事前選択・自動true補完・一括承認なし。
- 対象変更/再取得でレビューをリセット。通信切断、5xx、壊れた成功応答では同一UUID/bodyだけを明示再送。別操作へ自動遷移しない。
- stateAtOperationは現在状態ではない。登録後はGETで再確認。承認済みの上書き・撤回UIは追加しない。
- 表示projectionから承認者IDを除外。相談/回答/成果物/secretを保存しない。

pending commandはメモリー内だけ。ページ離脱後は状態/監査を照合し、結果不明のまま新UUIDで繰り返さない。入力SHAは人間の申告でありVercel公開SHAの自動検証ではない。

本番flag変更、Deploy、APPROVE、参加者登録、START/STOP、Provider、課金は範囲外。mergeを本番操作承認としない。
