# Production Gate 再検証報告

- 実査日: 2026-09-28（Asia/Tokyo）
- 対象main: `ec30c9a5036475a7d4e69d06a7fb62ed8efda29d`
- 対象production: `7e0d02172fdfc38301274d7fce4c905971a86730`
- 判定: **CONDITIONAL GO（自社限定運用）**（自動Gateは成功。未完了の人間・運用Gateは運用中に検証し、一般公開前に完了する）

## 1. 調査した内容

- GitHubのbranch、PR、CI、workflow、Environment、Deployment記録
- Vercel ProductionへのGitHub Deployment記録
- 正式ドメインの`/api/health/live`と`/api/health/ready`
- 現行のVercel build commandとmigration wrapper
- 旧`Production Database Migration` workflowの削除履歴
- Production Gate、DB運用、Deployment文書との差分

## 2. 確認できた証跡

| 対象                         | 証跡                                                                                                                                                                             | 結果                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| main CI                      | runs [36352543330](https://github.com/team478a/bunshin-platform/actions/runs/36352543330) / [36352723888](https://github.com/team478a/bunshin-platform/actions/runs/36352723888) | `verify` / `database`成功                             |
| release PR                   | [#976](https://github.com/team478a/bunshin-platform/pull/976) `main` → `production`                                                                                              | merge済み                                             |
| production commit            | `7e0d0217`                                                                                                                                                                       | `ec30c9a5`を親に含む                                  |
| Vercel Production            | [Deployment URL](https://bunshin-platform-pmq0q3ixx-team478as-projects.vercel.app) / GitHub Deployment `6698418895`                                                              | success                                               |
| manual health smoke          | run [36353422831](https://github.com/team478a/bunshin-platform/actions/runs/36353422831)                                                                                         | live / readiness成功                                  |
| scheduled health smoke       | run [36354229640](https://github.com/team478a/bunshin-platform/actions/runs/36354229640)                                                                                         | success                                               |
| 直接実査                     | `www.watashi-works.com`                                                                                                                                                          | live `ok`、readiness `ready`                          |
| readiness checks             | configuration / authentication / database / databaseSchema                                                                                                                       | すべて`ok` / `current`                                |
| production branch protection | GitHub branch protection API                                                                                                                                                     | PR必須、承認0件、`verify` / `database`必須、admin適用 |

Secret値、個人情報、接続文字列は取得・記録していない。

## 3. 変更したファイル

- `docs/DATABASE_OPERATION.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/PRODUCTION_ENVIRONMENT_PLAN.md`
- `docs/FREE_MVP_PRODUCTION_GATE.md`
- `docs/CURRENT_IMPLEMENTATION_HANDOFF_2026-09-28.md`
- `docs/PRODUCTION_GATE_REVALIDATION_2026-09-28.md`
- `docs/README.md`

## 4. 主要な設計・運用判断

1. 2026-09-07以降の本番migration正本は、Vercel Production build先頭の`pnpm db:migrate:vercel`とする。
2. 直後の`pnpm db:assert-ready`とWeb buildまで成功した場合だけ新releaseを公開する。
3. Preview / Developmentではmigrationを実行しない。
4. GitHub Environmentに残るDB Secret名は、現行Vercel release経路の接続情報として扱わない。
5. 自動Gate成功だけでProduction全体をGOにしない。
6. `production`はPR経由を必須とする。共同編集者が1名のため承認数は0件とし、strictな`verify` / `database`、会話解決、管理者適用、force push / branch削除禁止で保護する。第二レビュアー追加時に承認数1件を再評価する。
7. 2026-09-28の運用判断により、対象を自社管理アカウントへ限定し、未完了Gateの証跡を運用中に収集する条件付き運用を開始できる。これは一般公開、外部顧客向け販売、無人運用の承認ではない。

## 5. 未解決事項

- PR #976にはGitHub review記録がない。2026-09-28に追加したbranch protectionは以後のrelease PRへ適用される。
- Supabase backup保持期間とrestore rehearsalの最新記録がない。
- Vercel Production build logの保存先・保持期間が運用文書にない。
- Production Magic Link、LINE、AI Provider、Stripe、実端末の最新受け入れ記録がない。
- 法務、問い合わせ、data deletion、incident / rollback責任者の最終確認がない。

## 6. 自社限定運用の条件

1. 利用者を自社で管理できるアカウントに限定し、外部向け一般公開と無人運用へ拡大しない。
2. 未検証Providerは必要になるまで無効のままにし、有効化時は疎通、失敗記録、費用上限を個別確認する。
3. health / readiness、CI、本番エラー、AI・LINE等の配送失敗を確認し、データ境界違反、復旧不能、重大な認証障害があれば対象機能または運用を停止する。
4. Secret値や個人情報を文書へ残さず、対象commit、日時、担当者、結果、参照可能なrunだけを証跡化する。

## 7. 一般公開へ進める条件

1. backup / restore、接続種別、build log保持を運用担当者が確認する。
2. `FREE_MVP_SMOKE_TEST.md`に従い、実アカウント・実端末の受け入れを記録する。
3. LINE、AI、Stripeは各Go / No-Goを個別に実施し、未使用Providerは無理に有効化しない。
4. 人間によるsecurity / privacy / legal review完了後にのみGOへ変更する。
