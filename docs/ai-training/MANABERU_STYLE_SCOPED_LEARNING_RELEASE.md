# マナベルスタイル — 学習・LINE限定リリース

2026-10-09 JST。branch: `codex/manaberu-learning-release`。
基準Production branch: `24afc8a170097741844e068653b191bc822b1c2e`。
参照main: `ff64ccffd611c96215983969f2e409d2d69da2fb`。

## リリース判断

main全体にはOEM Registration Billing V2と自動Migration設定が含まれる。今回はそれらを公開せず、#1181の本人LINE接続（元commit `c632700f`）と#1182の学習・評価・再開修正（元commit `99b93526`）だけをProduction基点へ取り出す。元PRの実装報告・ADRは経緯として維持し、この限定リリースの検証結果とは区別する。

競合は `packages/database/src/schema-readiness.ts` の最新Migration定数だけ。採用する最新Migrationは `20261008140000_learning_member_line_link`。これは適用済みの宣言ではなく、アプリが要求する版である。実DBの適用確認がなければreadinessは通過させない。

## 公開に含めるもの / 含めないもの

- 本人LINE OAuthの既存認証・Tenant・同意検証、Bunshin不要の学習接続。
- 既存3Definition / Goal / Plan / Router / Mission / Assessmentを使用する学習画面修正。
- 非同期評価GETの上限付き確認、再訪時復元、明示retry、学習入口。
- ローカル合成ブラウザ7ケースとCI検証。実Providerを呼ばない。
- 唯一の追加Migration: `packages/database/prisma/migrations/20261008140000_learning_member_line_link/migration.sql`。
- OEM課金コード、OEM関連2Migration、課金cron変更、Migration runner変更、環境設定変更は含めない。
- `apps/web/vercel.json` は基準Productionと同一。buildはread-onlyの `db:assert-ready` の後にWebをbuildし、Migrationを自動実行しない。
- Pilot flag / Seat / allowlist / Definition approval / Call Admission / 旧V1 / LINE Scheduler隔離を維持。通知配信・参加者登録・STARTは行わない。

## Merge前の停止条件

このPRのbaseは `production`。**マージするとGit連携の本番Deployが開始するため、Draftのまま人間レビューを待つ。CI成功だけでマージしない。**

1. 対象Productionの公開SHAとDB接続先を再照合する。本書の基準SHAはGitの観測であり、現時点のVercel実公開の再証明ではない。
2. 最新Backup / 復元証跡、Migration history/checksum、未適用一覧とschemaを承認済みread-only手段で確認する。現在の実DB状態はUNKNOWN。
3. LINE Migrationは短期認証tableの `bunshin_id` のNOT NULL解除のみ。row削除・Backfill・RLS/index変更なし。ただしALTER TABLEのlockを考慮し、実DBのwriter/lock、既存row、旧コード互換を確認する。
4. 未適用なら対象1件のMigration手段・timeout・実行者を別途承認する。main checkoutで `prisma migrate deploy` を実行するとOEMを含む全pendingが対象になるため代用しない。本PRも全pendingが当該1件だと推測しない。
5. 承認後にのみMigration適用とschema/history検証を行う。履歴を偽装するresolve、適用済みfile編集、手入力による成功扱いは禁止。
6. Migration適用が確認できた後、別のDeploy承認でPRをproductionへマージ。readiness失敗なら停止し、自動retryしない。
7. 公開SHA、health live/ready、旧V1、管理、Pilot停止状態、LINE接続入口を確認。Pilot開始・Definition承認・本人Enrollment/Seat・実課金評価はさらに別Gate。

ここまでの作業では本番DB接続・変更、Deploy、参加者登録、Definition承認、START/STOP、Provider/LINE送信を実施していない。

## 検証証跡

限定ブランチの検証をPR本文とCIへ記録する。元PRのCIは限定ブランチのCIの代わりにしない。ブラウザ7ケースは実画面componentsと合成APIを使用し、本番認証/DB/ProviderのE2Eとは区別する。

追加release regressionは、OEM Migration/Prisma modelの非混入、LINE Migrationの限定SQL、最新Migration定数と実fileの一致を検証する。既存credential-release testでMigration自動実行なし・production-only deploy設定を確認する。

## Rollback

公開前の中止はDraftを維持する。公開後のApplication rollbackは基準Production版へ戻す別承認操作。nullable変更は旧非null試行と共存可能であり、DBを急いで戻さない。学習用null試行が残る間のNOT NULL復帰、履歴/接続の削除は禁止。必要ならPilot停止と失効待ちを別承認し、データを保全する。
