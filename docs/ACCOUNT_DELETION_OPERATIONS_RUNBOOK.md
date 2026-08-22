# Account Deletion Operations Runbook

更新日: 2026-08-22

## 1. 安全な初期状態

Productionでは次を維持する。

```text
ACCOUNT_DELETION_EXECUTION_MODE=disabled
ACCOUNT_DELETION_PRODUCTION_APPROVED=false
```

この状態でもCronは呼び出されるが、claim、Auth削除、DB更新は行わない。

## 2. 必要なProduction Secret

- `CRON_SECRET`
- `SUPABASE_AUTH_ADMIN_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_AUTH_ADMIN_ENV=production`

Service Role KeyはVercel Production環境変数だけへ登録する。Preview、DB、管理画面、GitHub Actions log、Runbookへ値を貼り付けない。

## 3. Dry-run

1. `ACCOUNT_DELETION_EXECUTION_MODE=dry-run`
2. `ACCOUNT_DELETION_PRODUCTION_APPROVED=false`
3. Productionを再deploy
4. `/api/internal/account-deletions/run`を正しいCron認証で実行
5. `mode=dry-run`であることを確認
6. due、processing、blockedの集計と`/admin/deletions`を照合

dry-run中にUser、退会申請、Auth、LINE、Workspaceが変更されていないことをDB監査で確認する。

## 4. Go条件

- 最新Migration適用済み
- Backup / Restore rehearsal完了
- Supabase Auth管理設定の環境一致確認
- BLOCKED対象の確認担当者決定
- Service Role Keyの登録・rotation担当者決定
- dry-run結果承認
- 最初の対象が検証用Production Userであること

## 5. 限定有効化

Go承認後だけ次を同時に設定する。

```text
ACCOUNT_DELETION_EXECUTION_MODE=enabled
ACCOUNT_DELETION_PRODUCTION_APPROVED=true
```

1回最大3件、1日1回実行される。最初の実行後は`COMPLETED`、`BLOCKED`、retry、infrastructure failure件数を確認する。

## 6. 緊急停止

異常時は最初に`ACCOUNT_DELETION_EXECUTION_MODE=disabled`へ戻して再deployする。進行中leaseが失効するまで待ち、コードrollbackより先に追加実行を止める。

Supabase Auth削除後のUserは復元不能として扱う。手動でUserをACTIVEへ戻さない。

## 7. BLOCKED再試行

`/admin/deletions`で分類と前提条件の解消を確認する。SUPER_ADMINだけが10〜500文字の理由を入力して再試行できる。再試行は即時削除ではなくREQUESTEDへ戻し、次のSchedulerでGateを再評価する。

## 8. 監視してはいけない値

次をlog、Audit、チケットへ保存しない。

- email
- Supabase provider user ID
- LINE user ID
- Service Role Key
- Provider response本文
- Knowledge、Memory、Mission本文
