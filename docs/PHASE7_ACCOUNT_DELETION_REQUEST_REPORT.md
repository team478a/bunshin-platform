# Phase 7 Account Deletion Request 実装レポート

本人sessionに限定した退会要求・取消、14日猶予、管理者の確認専用一覧を実装した。即時削除やUser状態変更は行わない。要求は履歴resourceとして保存し、PostgreSQL partial unique indexにより有効な要求をUserごとに1件へ制限する。

DB migration: `20260822003000_account_deletion_requests`

次の条件は、匿名化対象一覧、組織Workspaceの所有権移管、法定保持、Supabase Auth削除、backup保持期間、運用承認が確定することである。
