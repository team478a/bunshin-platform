# Phase 2 Production Gate

更新日: 2026-08-19

## 判定

Phase 2コードは完了しているが、Production利用開始は未承認である。値やsecretを本書へ記録せず、完了日時、実行者、GitHub Actions runまたは確認画面だけを運用記録へ残す。

## A. 完了確認済み

- [x] Phase 2対象PR #5〜#20がmainへmerge済み
- [x] CIで全migrationを空PostgreSQLへ適用済み
- [x] CIの`verify`と`database`が成功
- [x] Vercel Preview buildが成功
- [x] Vercel Function regionは`apps/web/vercel.json`で`hnd1`
- [x] Production migration workflowは`main`、確認文字列、Environment承認を要求
- [x] PreviewへProduction DBを接続しない方針を文書化
- [x] Stagingは実運用開始まで作成しない方針を文書化

## B. Production DB

- [ ] Supabase daily backupが有効で保持期間を確認した
- [ ] restore手順を確認し、必要ならrehearsalを実施した
- [ ] GitHub Environment `production`のrequired reviewerを確認した
- [ ] `DATABASE_URL`がtransaction pooler、`DIRECT_URL`がmigration用session/direct接続である
- [ ] `main`の対象commitとmigration 5件を確認した
- [ ] `Production Database Migration` workflowを承認付きで実行した
- [ ] 実行後の`prisma migrate status`が最新である
- [ ] `/api/health/ready`が`database: ok`を返す

## C. Production Auth

- [ ] Supabase Auth Site URLがProduction URLである
- [ ] Redirect URL allowlistがProduction callbackだけを許可する
- [ ] Email OTP/Magic Linkのrate limitと再送間隔を確認した
- [ ] Resend custom SMTP、認証用domain、SPF、DKIM、DMARCを設定した
- [ ] link trackingを無効化した
- [ ] Production Magic Linkでloginできる
- [ ] logout後に保護画面/APIへアクセスできない
- [ ] 停止User/Identity/Membershipが拒否される

## D. Browser smoke

- [ ] mobile viewportでBunshin作成、編集、archiveが動作する
- [ ] Knowledge作成、grant、revoke、archiveが動作する
- [ ] Memory作成、編集、停止、再有効化、削除が動作する
- [ ] SOCIAL Capability割当、停止、再有効化が動作する
- [ ] User AからUser BのURLへアクセスして404になる
- [ ] Bunshin Aの子resourceをBunshin Bのpathで操作して404になる
- [ ] error responseとlogにemail、token、cookie、本文、configが出ない

## E. Operations / Security

- [ ] Vercel Spend Managementの通知と上限actionを確認した
- [ ] domain、HTTPS、問い合わせ導線を確認した
- [ ] privacy policy、利用規約、data deletion窓口を確認した
- [ ] dependency auditを確認した
- [ ] human security/privacy reviewを完了した
- [ ] incident連絡先、rollback責任者、migration実行者を確認した

## 完了条件

B〜Eが完了し、Production責任者が利用開始を明示承認する。Stagingを作らないこと自体はblockerにしない。Productionへ直接migrationする場合はbackup、承認、smoke、rollback準備を省略しない。
