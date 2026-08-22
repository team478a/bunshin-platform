# Phase 7 Account Deletion Execution Core 実装報告

## 完了範囲

- `PROCESSING | BLOCKED`状態と実行lease、attempt、version、最小summary
- 猶予終了済みrequestのatomic claimと期限切れlease回収
- ACTIVE Platform Admin、Organization唯一OWNER、Organization内所有contentのBLOCKED Gate
- User / Membershipの可逆的SUSPENDED化
- LINE通知同意・Connectionの停止
- 未送信LINE Delivery、未完了Jobの取消
- 未使用Mission Deep Link stateの失効
- Userごとに`REQUESTED | PROCESSING | BLOCKED`を最大1件にするDB制約

## 境界

本実装は外部Auth削除、AuthIdentity削除、UserのDELETED化、email・本文・外部IDのpurge、Scheduler、管理者再実行を行わない。処理対象を安全に停止し、後続Adapterへ渡せる`PROCESSING`状態までを担当する。

BLOCKED時はUserと関連resourceを変更せず、固定分類だけを保存する。PROCESSING時のsummaryには更新件数だけを保存し、email、LINE user ID、Workspace、Bunshin、Mission、本文を複製しない。

## Migration

- `20260822170000_account_deletion_execution_core`
- `20260822170100_account_deletion_execution_fields`

PostgreSQL enum追加と、その値を使用するindex・constraintを別transactionへ分割したadditive migrationである。

## 次のPR

`ACCOUNT_DELETION_EXECUTION_PLAN.md`のPR BとしてSupabase Auth Administration Port / Adapterを実装する。Production Service Role Key登録や実削除は、Adapter検証と人間確認後まで行わない。
