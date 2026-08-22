# Production Readiness Audit — 2026-08-22

## 判定

**NO-GO（設定・運用確認待ち）**。アプリケーションは稼働しているが、100人検証開始の全Gateは未完了である。

## 実コード・外部状態の確認結果

| 項目                                | 状態           | 根拠                                                           |
| ----------------------------------- | -------------- | -------------------------------------------------------------- |
| 最新main                            | OK             | `e38e9eab26d031342638e3531642441207fe4eb2`                     |
| main CI                             | OK             | PR #85 `verify` / `database`成功                               |
| Vercel Production                   | OK             | deployment `6029600254`、main SHA一致                          |
| live / ready                        | OK             | 2026-08-22、両方HTTP 200、DB `ok`                              |
| production dependency audit         | OK             | `pnpm audit --prod --audit-level high`、既知の脆弱性0件        |
| Production required reviewer        | OK（要改善）   | reviewer 1名、自己承認禁止はOFF                                |
| Environment DB secrets              | OK             | `DATABASE_URL` / `DIRECT_URL`。値は未取得                      |
| main branch protection              | OK             | `verify` / `database`必須、strict、admin適用、会話解決必須     |
| Production deployment branch policy | OK             | custom policyで`main`だけを許可                                |
| 最新DB migration                    | OK             | Actions run `32535372263`、適用後status成功                    |
| Production Health Smoke             | OK             | Actions run `32579885767`、Auth / DBを含むreadiness成功        |
| Supabase Pro daily backup           | 契約上利用可能 | 公式仕様は日次・7日保持。Dashboardで実プロジェクト状態を要確認 |
| restore rehearsal                   | BLOCKER        | 実施記録なし                                                   |
| Vercel Spend Management             | BLOCKER        | Dashboardの設定値・hard pause・通知先を未確認                  |
| Auth configuration                  | OK             | Vercel Production設定済み、readiness `authentication: ok`      |
| Auth URL / Magic Link               | BLOCKER        | Redirect allowlistと本番Magic Link実操作の確認記録なし         |
| FREE MVP smoke                      | BLOCKER        | 完走記録なし                                                   |

## 2026-08-22適用済みmigration

1. `20260821220000_legal_documents`
2. `20260821234000_user_legal_consents`
3. `20260822003000_account_deletion_requests`

`Production Database Migration`をmainから承認実行し、実行後の`prisma migrate status`成功を確認した。

## 人間が行う順序

1. Supabase Dashboardで日次backupと7日保持を確認する。
2. `BACKUP_RESTORE_RUNBOOK.md`に従いrestore rehearsalの日時・担当・結果を記録する。
3. Supabase Auth Site URLとRedirect URL allowlistをProduction URLへ設定する。
4. Vercel Spend Managementと通知を確認する。
5. Magic Link、法務同意、FREE MVP smokeを本番テストアカウントで完走する。
6. 退会処理のService Role Key、dry-run、限定検証をRunbookに従って実施する。
7. 責任者が対象SHAと日時を記録してGoを宣言する。

Production Environmentの自己承認禁止は、現在のrequired reviewerが1名だけのため未適用である。第二承認者を追加してから有効化する。

## 費用判断

約55 USD/月の開始枠では、Supabase Proの日次backupを基本とする。PITRは公式価格で追加約100 USD/月（7日）のため、初期枠には含めず、日次backupではRPOが不足すると判断した時点で再検討する。

## 公式根拠

- Supabase Database Backups: https://supabase.com/features/database-backups
- Supabase PITR Usage: https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery
- Vercel Spend Management: https://vercel.com/docs/spend-management
- GitHub Deployments and Environments: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
