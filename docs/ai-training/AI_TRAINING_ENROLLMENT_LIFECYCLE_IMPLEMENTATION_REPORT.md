# AI研修 終了・取消・再開 実装報告

## 調査

PR #996マージ後のmain `79edfb2c`を基準とした。既存管理画面は終了・期限終了を表示するが取消を一覧から除外し、変更導線がなかった。受講更新、管理者権限、Job参照、評価確定、期限Trigger、契約Snapshot、関連テストを確認した。

## 変更したファイル

- capability-training/enrollment-lifecycle: 状態遷移とRepository Port、公開入口、15遷移テスト。
- database/training-enrollment-lifecycle: 権限・参加・Module境界、受講ロック、状態/更新時刻CAS、再送監査、評価停止。公開入口、Unit・実DB統合テスト。
- web/http/ai-training-lifecycleとService別POST Route: 認証、Origin、4096byte上限、入力確認、Scopeサーバー解決。
- manage/training: 取消を含む一覧、確定終了日、状態操作カード、理由・確認・失敗時案内。更新日時でカードを再マウントし、古い確認状態を持ち越さない。
- dashboard集計: 取消・期限終了を継続中/支援待ちと混同しない。HTTP・表示テスト。
- D-135、ロードマップ、本報告。

## 設計判断

ACTIVEから終了/取消、終了状態から再開のみ許可。招待受諾・期間延長は対象外。SERVICE_OWNER/ADMINをDBでも有効な本人・Workspace・Groupとともに再確認する。確認状態・更新時刻が変われば409。Operation UUIDと同一理由・確認対象の監査を使い、再送で再開/終了日を繰り返し変更しない。

受講行ロックとSerializable transactionで状態、Jobキャンセル、PENDING回答FAILED化、監査を確定する。遅延評価はPENDING条件により拒否され、再開時も自動評価しない。契約Snapshot、startsAt/endsAt、回答本文、点数、Toolkitは変更しない。終了日記録/再開時リセットは既存Triggerを使用する。

再開はProgram/参加/本人がACTIVEかつ開始後・終了予定前に限定する。期間外なら拒否し、勝手な無料延長はしない。期限処理で消した情報は復元せず、必要なら本人が初期設定を入力し直す。過去終了日は推測しない。

## 検証

Unitでは状態遷移、管理者・所有境界、確認競合、再送、期限/参加資格、評価停止、失敗伝播、Origin・認証・サイズ・入力・HTTP分類、初期非確定UIを確認する。実DBでは取消時の確定終了記録/PENDING回答停止、再送、期間外拒否、明示的テストFixture期間変更後の再開・終了記録リセットを検証する。全体format/typecheck/lint/test/buildとMigration/DB統合結果はPR欄へ記録する。

## 未解決事項と次へ進める条件

DB Schema変更・Migration追加なし（#996のMigration適用が前提）。本番操作・データ消去・保持期限停止解除・Cron・課金/返金・外部API・LINE送信を行っていない。既に外部送信済みの処理の撤回は保証しない。終了通知、契約期間延長、過去終了日の確定、自動終了、消去復元は別タスク。

CI/実DB検証・人間レビュー後にマージ可能。運用では管理者・対象・理由を確認して個別操作する。本番の保持期限自動処理は引き続き別の運営承認と停止/復旧検証が必要。
