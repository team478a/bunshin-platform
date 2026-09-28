# AI研修 期限処理・終了日時記録 実装報告

## 調査

Preflight PR #995マージ後のmain `7bf6c650`を基準に、回答・評価、Profile、Toolkit、課題Snapshot、目標・Preference・活動Event、参加監査の複製と評価/Runtimeの確定経路を確認した。古い完了/取消日を予定終了日から推定しない方針を維持する。

## 変更

- Capabilityの保持期限Portに受講単位のPreview/確認Revision/実行契約を追加。
- `TrainingDataRetentionState`とMigration: Scope付きFK、RLS、確定終了日・仕事情報処理済み日・進捗処理済み日。AI研修の将来の終了状態への変更をDB Triggerで記録し、再開時はリセットする。既存行は補完しない。
- DBの`training-retention-snapshot.ts`と`training-retention-execution.ts`: 管理者・所有境界、期限・Snapshot上限、確認Revision、受講排他、Job停止、消去/匿名化、最小監査、再送。
- Preflightは記録済み終了日時と処理済み印を参照する。
- `POST /api/internal/ai-training/retention-execution`: SUPER_ADMIN本人、same-origin、明示Scope、Preview/Execute、確認文字列、1024byte上限。実行はdevelopment/staging限定。production/その他では503 DISABLED。
- 評価の確定はロック後にACTIVEを再確認する。共通の目標/Preference書込も受講ロックとACTIVE再確認で終了・消去と競合しないようにする。
- Capability/DB/HTTP/境界テスト、実PostgreSQL統合テスト、D-134、ロードマップ。

## 消去範囲

回答90日では回答本文・評価・回答由来Eventを削除し、対応する評価Jobを停止する。未完了課題をスキップし、現在課題参照を解除する。本人が明示保存したToolkitは削除しない。

確定終了から90日では職種をOTHERへ戻し、仕事Context・用途・課題・希望Topic・学習Goalキーを消去する。課題表示Snapshot、活動metadata、目標の自由文、Preferenceのnotes、Enrollmentの目標Snapshotも消去する。参加監査のJSONからgoalSnapshotキーだけを除去し、契約/請求Snapshotや監査の存在を捨てない。点数・集計進捗は維持する。

確定終了から暦年1年ではProfile・進捗・課題・活動履歴・目標・Preferenceを削除する。Toolkitと契約・参加・費用・最小監査は維持する。回答は独立した90日期限で処理し、新しい回答を早めて削除しない。学習を継続する再開時には、初期設定を入力し直す必要がある。

Previewは本文・評価・仕事情報・点数・Toolkit本文を返さず、件数・起算日不足・SHA-256 Revisionだけを返す。各一覧2000件を超えた場合は413で拒否する。確認後に対象ID/更新日時・状態・処理済み印が変わると409。監査の同一Revision再送は新しいデータを消さない。件数は確認対象行数であり、activities/goals/preferencesは90日時点では匿名化、1年時点では削除を表す。

## 検証

関連Unit testは期限対象、点数維持、Toolkit維持、管理者/所有境界、Snapshot変更、再送、例外時失敗、本番停止、Origin・認証・サイズ・入力検証を確認する。実DBでは将来の終了記録、90日後の回答/仕事情報消去と点数/契約維持、1年後の進捗消去、Toolkit読取、他参加者維持、再開時の記録リセットを検証する。全体format/typecheck/lint/test/buildとDB統合テストの結果はPR検証欄へ記録する。

## 未解決・本番有効化条件

本番Migration・実行・本番データ消去、Cron登録、環境設定の変更、LINE送信、AI実API呼出は行っていない。Migrationは非破壊のテーブル/Trigger追加で、過去行の終了日時補完や消去は含まない。終了操作の新しい利用者UIは追加しておらず、既存/将来の終了状態への変更を記録する。

本番実行の停止解除と定期実行は別の変更・運営承認が必要。対象ScopeのPreflightと本人Export、起算日保留の解消、対象件数上限、停止/復旧手順、削除証跡を確認後に有効化する。過去の完了/取消は引き続き終了日保留になる。Backup、外部Provider、端末へ保存したExportの消去は保証しない。処理済み印による冪等性は保持し、アプリ外から直接書き戻す運用は行わない。
