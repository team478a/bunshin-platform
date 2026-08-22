# Phase 7 Account Deletion Operations 実装報告

更新日: 2026-08-22

## 完了範囲

- Execution claimからSupabase Auth削除、Personal Data Purgeまでのbatch orchestration
- EMAIL Auth Identityのrequest / User / worker / lease付き再解決
- Provider障害のretry、BLOCKED、固定分類記録
- 1回最大3件のCron保護Scheduler endpoint
- `disabled | dry-run | enabled`の実行Mode
- Production `enabled`の二重承認Gate
- BLOCKED分類、試行回数、最終エラーの管理画面表示
- SUPER_ADMIN限定、理由必須のBLOCKED再試行
- 再試行専用Audit Table / Migration
- Production dry-run、Go、緊急停止Runbook

## 安全境界

既定Modeは`disabled`であり、merge・deployだけでは退会処理をclaimしない。dry-runは件数だけを返し、Auth・DBを変更しない。Productionの`enabled`は`ACCOUNT_DELETION_PRODUCTION_APPROVED=true`が同時に存在しなければ設定検証で拒否する。

Auth削除成功後だけpurgeへ進む。Provider user不在は冪等成功とし、timeout、429、5xxは再試行、credential・環境不一致はBLOCKEDとする。レスポンスとlogへUser ID、email、providerUserId、本文、Provider responseを出さない。

## 運用未完了

- Vercel ProductionへのService Role Key登録
- Production Migration適用
- Production dry-run
- Backup / Restore rehearsalの最終確認
- 検証用Production Userでの限定実行
- 人間によるGo承認

これらはコード完了とは分離し、`ACCOUNT_DELETION_OPERATIONS_RUNBOOK.md`に従って実施する。
