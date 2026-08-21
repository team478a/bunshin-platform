# Production Readiness Audit — 2026-08-22

## 判定

**NO-GO（設定・運用確認待ち）**。アプリケーションは稼働しているが、100人検証開始の全Gateは未完了である。

## 実コード・外部状態の確認結果

| 項目                                | 状態           | 根拠                                                           |
| ----------------------------------- | -------------- | -------------------------------------------------------------- |
| 最新main                            | OK             | `f3ac9d0283555d700df5036ffeff9f32b3e46a7d`                     |
| main CI                             | OK             | Actions run `32535246116`                                      |
| Vercel Production                   | OK             | deployment `6029600254`、main SHA一致                          |
| live / ready                        | OK             | 2026-08-22、両方HTTP 200、DB `ok`                              |
| production dependency audit         | OK             | `pnpm audit --prod --audit-level high`、既知の脆弱性0件        |
| Production required reviewer        | OK（要改善）   | reviewer 1名、自己承認禁止はOFF                                |
| Environment DB secrets              | OK             | `DATABASE_URL` / `DIRECT_URL`。値は未取得                      |
| main branch protection              | BLOCKER        | GitHub APIで未設定を確認                                       |
| Production deployment branch policy | BLOCKER        | 制限なし                                                       |
| 最新DB migration                    | OK             | Actions run `32535372263`、適用後status成功                    |
| Production Health Smoke             | OK             | Actions run `32535679734`、live / ready成功                    |
| Supabase Pro daily backup           | 契約上利用可能 | 公式仕様は日次・7日保持。Dashboardで実プロジェクト状態を要確認 |
| restore rehearsal                   | BLOCKER        | 実施記録なし                                                   |
| Vercel Spend Management             | BLOCKER        | Dashboardの設定値・hard pause・通知先を未確認                  |
| Auth URL / Magic Link               | BLOCKER        | Dashboardと本番操作の確認記録なし                              |
| FREE MVP smoke                      | BLOCKER        | 完走記録なし                                                   |

## 2026-08-22適用済みmigration

1. `20260821220000_legal_documents`
2. `20260821234000_user_legal_consents`
3. `20260822003000_account_deletion_requests`

`Production Database Migration`をmainから承認実行し、実行後の`prisma migrate status`成功を確認した。

## 人間が行う順序

1. main branch protectionを設定し、CI `verify` / `database`をrequiredにする。
2. Production Environmentをmainだけに制限し、可能なら自己承認を禁止する。
3. Supabase Dashboardで日次backupと7日保持を確認する。
4. `BACKUP_RESTORE_RUNBOOK.md`に従いrestore rehearsalの日時・担当・結果を記録する。
5. Production migrationを承認実行する。（完了）
6. `Production Health Smoke`をmainから実行する。（完了）
7. Vercel Spend Managementと通知を確認する。
8. Auth、法務同意、FREE MVP smokeを本番テストアカウントで完走する。
9. 責任者が対象SHAと日時を記録してGoを宣言する。

## 費用判断

約55 USD/月の開始枠では、Supabase Proの日次backupを基本とする。PITRは公式価格で追加約100 USD/月（7日）のため、初期枠には含めず、日次backupではRPOが不足すると判断した時点で再検討する。

## 公式根拠

- Supabase Database Backups: https://supabase.com/features/database-backups
- Supabase PITR Usage: https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery
- Vercel Spend Management: https://vercel.com/docs/spend-management
- GitHub Deployments and Environments: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
