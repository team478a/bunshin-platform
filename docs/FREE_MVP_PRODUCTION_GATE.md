# FREE SOCIAL MVP Production Gate

更新日: 2026-08-21

## 判定

Phase 0〜5のコードは完了している。本番利用開始には、以下の人間確認と本番環境での実行記録が必要である。Secretや個人情報は本書へ記録せず、実行日時、担当者、対象commit、GitHub Actions run、確認結果だけを残す。

2026-08-22時点の実査は`PRODUCTION_READINESS_AUDIT_2026-08-22.md`を参照する。現在の判定は**NO-GO**。

## A. 自動検証

- [x] `main`のCI `verify` / `database`が成功している
- [ ] main branch protectionで両checkをrequiredにした
- [x] Vercel Production deploymentが成功している
- [x] 空PostgreSQLへの全migration適用が成功している
- [x] dependency auditの重大問題を確認した（2026-08-22、既知の脆弱性0件）

## B. Production Database

- [ ] Supabase backupと保持期間を確認した
- [ ] restore手順と責任者を確認した
- [x] GitHub Environment `production`のrequired reviewerを確認した
- [ ] Productionをmainだけに制限し、自己承認禁止を確認した
- [x] GitHub Environmentに`DATABASE_URL` / `DIRECT_URL` secret名が存在する
- [ ] `DATABASE_URL`がtransaction poolerであることをSupabase接続画面で再確認した
- [ ] `DIRECT_URL`がmigration用session/direct接続であることをSupabase接続画面で再確認した
- [x] 対象commitのProduction migration workflowを承認・実行した
- [x] 最新mainに対してProduction migration workflowを承認・実行した（run `32535372263`）
- [x] 最新mainで`prisma migrate status`が最新である
- [x] `/api/health/ready`が`database: ok`を返す
- [x] Production Health Smokeが成功した（run `32535679734`）

## C. Auth / AI / Application Configuration

- [ ] Supabase Auth Site URLとRedirect URL allowlistがProduction URLだけを許可する
- [ ] Vercel ProductionのSupabase公開認証設定がreadinessで`authentication: ok`になる
- [ ] Production Magic Linkでlogin/logoutできる
- [ ] `OPENAI_API_KEY`がVercel Productionだけに設定されている
- [ ] Planner / Content / Qualityのmodel環境変数を確認した
- [ ] AI失敗時に本文・Knowledge・keyがログへ出ないことを確認した
- [ ] Vercel Function上限60秒、Provider timeout 45秒が反映されている

## D. FREE MVP Acceptance

- [ ] Bunshin作成からSOCIAL有効化まで完了できる
- [ ] Social Profile、Strategy生成・承認、Content Pillar、Weekly Plan生成・確定が完了できる
- [ ] Daily Mission生成・閲覧が完了できる
- [ ] 採用後だけformat別コピー操作が表示される
- [ ] 不採用理由を文章入力なしで保存できる
- [ ] 「投稿しました」とGOOD / NEUTRAL / BAD Feedbackを保存できる
- [ ] 同日・同Bunshinの重複生成が409で拒否される
- [ ] User / Workspace / Bunshinを越えるアクセスが404になる

詳細手順は`FREE_MVP_SMOKE_TEST.md`を正本とする。

## E. Operations / Legal

- [ ] Vercel / Supabase / OpenAIの利用上限・通知を確認した
- [ ] incident連絡先、rollback責任者、migration実行者を確認した
- [ ] 利用規約、プライバシー、問い合わせ、data deletion窓口を確認した
- [ ] Production URL、HTTPS、サポート導線を確認した
- [ ] 人間によるsecurity/privacy reviewを完了した

## F. LINE Production Gate

- [ ] Production専用LINE Login / Messaging API / Webhook設定を確認した
- [ ] Vercel Productionへ外部管理者通知URL・host allowlist・必要なTokenを登録した
- [ ] GitHub Environment `production`へ`PRODUCTION_CRON_SECRET`を登録した
- [ ] `/api/internal/line/readiness`がProduction、ready、alertingConfigured、alerts空を返した
- [ ] `Production LINE Go-No-Go` workflowが最新mainで成功した
- [ ] LINE通知同意、quota、緊急停止、担当者、rollbackを人間が確認した

詳細手順は`LINE_PRODUCTION_GO_NO_GO_RUNBOOK.md`を正本とする。LINE Pushを伴わない技術Gate成功だけでは実ユーザー送信を開始しない。

## Go / No-Go

すべて完了し、Production責任者が対象commitと実行日時を記録して明示承認した場合だけGoとする。Stagingを作らない方針はblockerにしないが、backup、migration承認、smoke、rollback準備は省略しない。
