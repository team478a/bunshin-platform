# Production Environment Plan

調査日: 2026-08-18

## 結論

初期本番環境は次を推奨する。

| 領域           | 推奨                                  | 設定                                                  |
| -------------- | ------------------------------------- | ----------------------------------------------------- |
| Web / API      | Vercel Pro                            | Tokyo `hnd1`、GitHub連携、ProductionとPreviewを分離   |
| Database       | Supabase Pro                          | Tokyo `ap-northeast-1`、production/stagingを別project |
| Runtime DB接続 | Supavisor transaction mode            | `DATABASE_URL`、port `6543`                           |
| Migration接続  | direct connectionまたはsession pooler | `DIRECT_URL`。CI/Vercel buildから自動migrationしない  |
| DNS            | 所有中のDNS provider                  | `app.<domain>`をVercelへ接続                          |
| CI             | GitHub Actions                        | 現在の`verify`と`database`をrequired checksにする     |
| Backup         | Supabase Pro daily backup             | 初期は7日保持。PITRは利用量・重要度上昇時に追加       |
| Secrets        | Vercel Environment Variables          | Production / Preview / Developmentを分離              |

この構成は本番リソースを今すぐ作らなくても、アカウント、責任者、命名、secret、migration手順を先に準備できる。

## 推奨理由

### Vercel Pro

- Next.jsのdeploy、Preview、HTTPS、CDNを少ない運用作業で利用できる
- 東京のFunction region `hnd1`を選択でき、東京のDBと近接配置できる
- 商用利用を前提とするため、非商用・個人利用向けのHobbyではなくProを選ぶ
- Spend Managementで50% / 75% / 100%通知や上限到達時の停止を設定できる

注意: Vercel Functionの新規project既定regionは`iad1`であるため、東京を明示しないとDBとの往復遅延が増える。

### Supabase Pro

- PostgreSQL、connection pooler、backupを一体で運用できる
- Tokyo `ap-northeast-1`を明示選択できる
- Prisma＋serverlessではSupavisor transaction modeをruntimeに利用できる
- Proにはdaily backup 7日保持が含まれ、Freeのような非稼働pauseを避けられる

Supabase Auth、Data API、Storage、Realtimeは、必要性が決まるまで採用しない。Phase 1のapplication sessionとPrisma接続境界を維持する。

## 代替案との比較

| 案                           | 初期運用                          | 長時間Job        | DB接続                       | 現段階の評価            |
| ---------------------------- | --------------------------------- | ---------------- | ---------------------------- | ----------------------- |
| Vercel + Supabase            | 最小                              | workerは後で分離 | pooler必須                   | 推奨                    |
| Cloud Run + Cloud SQL        | IAM、container、network設定が必要 | 強い             | persistent接続を構成しやすい | Phase 4以降の再評価候補 |
| Vercel + Cloud SQL           | cross-cloud運用が増える           | 別workerが必要   | network/接続設計が複雑       | 初期は非推奨            |
| Supabase Free + Vercel Hobby | 安価                              | 制限が大きい     | 検証向け                     | 商用本番には使用しない  |

Cloud Runは東京regionと従量課金を利用でき、将来のworker、scheduler、長時間AI処理には適する。Webまで今すぐ移す必要はなく、Phase 4以降に`apps/worker`または独立APIの要件が生じた時点で再評価する。

## 月額の初期目安

2026-08-18時点の公式表示を基にした税・為替・超過料金を除く概算。

| 項目                     |             概算 |
| ------------------------ | ---------------: |
| Vercel Pro 1 seat        |   USD 20 / month |
| Supabase Pro plan        |   USD 25 / month |
| 2つ目のMicro compute相当 |   USD 10 / month |
| 合計baseline             | 約USD 55 / month |

Supabase ProはUSD 10のcompute creditを含み、Micro 1台分に相当する。productionとstagingを別projectにすると、2台目のMicro相当が追加される想定である。正確な請求額は契約直前にpricing calculatorで再確認する。

PITRは初期導入しない。公式価格では7日保持がUSD 100/monthからで、Small以上のcomputeも必要になるため、daily backup＋restore rehearsalで開始する。決済・顧客データ・高頻度更新が本番に入る前にPITRを再評価する。

## 環境構成

```text
GitHub main
  └─ Vercel Production (hnd1)
       └─ Supabase production (ap-northeast-1)

GitHub pull request / staging branch
  └─ Vercel Preview
       └─ Supabase staging (ap-northeast-1)

Local / GitHub Actions
  └─ local or ephemeral PostgreSQL
```

Preview deploymentを共有staging DBへ接続する場合、古いPRコードと新しいschemaの互換性が崩れる可能性がある。migrationを含むPRでは、Previewを自動的にstaging DBへ向けず、互換性確認後に限定して接続する。

## 命名案

| 対象                  | 名前                                                         |
| --------------------- | ------------------------------------------------------------ |
| Vercel Team           | `team478a`                                                   |
| Vercel Project        | `bunshin-platform`                                           |
| Supabase Organization | `team478a`                                                   |
| Supabase production   | `bunshin-platform-prod`                                      |
| Supabase staging      | `bunshin-platform-stg`                                       |
| GitHub Environment    | `production`, `staging`                                      |
| Production URL        | `app.<owned-domain>`                                         |
| Staging URL           | Vercel Preview URL。固定domainが必要なら`stg.<owned-domain>` |

## 今すぐ準備できる項目

課金やproject作成前:

- [ ] Vercel、Supabase、GitHubのOwnerを決める
- [ ] Billing担当者と月額上限を決める
- [ ] production deploy承認者を決める
- [ ] migration実行者とbackup確認者を分ける
- [ ] 利用domainとDNS管理者を決める
- [ ] incident連絡先を決める
- [ ] secret保管・rotation責任者を決める

アカウント準備後:

- [ ] Vercel Pro teamを作成する
- [ ] Spend Managementの50% / 75% / 100%通知と上限時actionを設定する
- [ ] Supabase Pro organizationを作成する
- [ ] production/stagingをTokyoで別projectとして作成する
- [ ] GitHub branch protectionで`verify`と`database`をrequiredにする
- [ ] Vercel projectをGitHub repositoryへ接続する
- [ ] Vercel Root Directoryを`apps/web`、Framework Presetを`Next.js`にする
- [ ] Function regionを`hnd1`に固定する
- [ ] ProductionとPreviewへ別々の環境変数を登録する
- [ ] stagingへmigrationを適用し、health checkを確認する
- [ ] backup取得とrestore rehearsalを実施する
- [ ] production migrationを承認付きで適用する
- [ ] domain、HTTPS、監視通知を確認する

## Secret一覧

| Secret           | Production                   | Preview/Staging             | 管理                             |
| ---------------- | ---------------------------- | --------------------------- | -------------------------------- |
| `DATABASE_URL`   | prod transaction pooler      | stg transaction pooler      | Vercel server-only               |
| `DIRECT_URL`     | prod direct/session endpoint | stg direct/session endpoint | migration環境。通常runtimeへ不要 |
| `SESSION_SECRET` | production固有               | staging固有                 | 32 bytes以上のrandom value       |
| `APP_ENV`        | `production`                 | `staging`                   | non-secret                       |
| `APP_URL`        | production URL               | Preview/staging URL         | server-only                      |
| `LOG_LEVEL`      | `info`推奨                   | `debug`または`info`         | 個人情報を出さない               |

`DIRECT_URL`をVercel Runtimeへ常設するかは最小権限の観点で見直す。migration専用GitHub Environmentまたは管理端末だけに置けるなら、その構成を優先する。

## Migration運用

1. PRのCIで空DBへの`prisma migrate deploy`とintegration testを成功させる
2. migrationの前方互換性とrollback方法をレビューする
3. staging backupを確認する
4. stagingへ手動で`pnpm db:migrate:deploy`を実行する
5. staging deploy後に`/api/health/live`と`/api/health/ready`を確認する
6. production変更時間と担当者を記録する
7. production backupを確認してmigrationを適用する
8. production deployとsmoke testを実行する
9. 失敗時は安易にdown migrationせず、restoreまたはforward fixを承認して実施する

## 本番化のGate

- [ ] Draft PR #1とPhase 2対象PRが承認・merge済み
- [ ] stagingで同一commitとmigrationを検証済み
- [ ] daily backupが有効でrestore手順を検証済み
- [ ] productionとstagingのsecretが完全に分離されている
- [ ] Vercel FunctionとSupabase DBが東京regionにある
- [ ] spend alertと請求担当者が設定されている
- [ ] domain、利用規約、プライバシーポリシー、問い合わせ導線がある
- [ ] security reviewとdependency auditが成功している
- [ ] incident、rollback、data deletionの手順がある

## 再評価条件

次のいずれかが発生したらCloud Run / Cloud SQLまたはworker分離を再評価する。

- Vercel Functionの実行時間制限に近づく
- job、scheduler、retry、dead-letterが必要になる
- DB connection上限やpooler制約が継続的な問題になる
- private networkや固定egress IPが必須になる
- 一体化したGCP監視・IAM・請求が運用上有利になる
- Vercel/Supabase間のegressまたは費用が支配的になる

## 公式資料

- [Vercel plans](https://vercel.com/docs/plans)
- [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby)
- [Vercel regions](https://vercel.com/docs/regions)
- [Vercel Function region configuration](https://vercel.com/docs/functions/configuring-functions/region)
- [Vercel pricing](https://vercel.com/pricing)
- [Vercel spend management](https://vercel.com/docs/spend-management)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Prisma guide](https://supabase.com/docs/guides/database/prisma)
- [Supabase backups](https://supabase.com/docs/guides/platform/backups)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
