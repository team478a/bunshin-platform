# 本番適用済みmigration履歴ファイルの同期

## 調査

ログイン表示修正のProduction buildは`history-unexpected`で停止した。稼働中のDeploymentは切り替わらず、health/readyは正常だった。

2026年11月2日JST、既存のProduction Migration History Probeをmainで実行した。承認済みproject refへ読み取り専用で接続し、`MIGRATION_HISTORY_PROBE UP_TO_DATE: pending=0; migration changes=none.`を確認した。

確認記録: https://github.com/team478a/bunshin-platform/actions/runs/41320066524

productionとmainのmigrationファイル差分は次の3件だけだった。

- `20261025120000_seed_hassy_public_service`
- `20261025130000_repair_official_service_identity`
- `20261025131000_align_manaberu_public_registration_copy`

## 変更と判断

既に本番へ適用された3件のmigration.sqlをmainから本文変更なしで同期し、`packages/database/src/schema-readiness.ts`の最新migration定数を同じmainの値に合わせる。新規migrationや新しいSQLは作成しない。他の機能コードやPrisma schemaは変更しない。

3件のSQLを本番で再実行せず、DB履歴の補完や変更も行わない。Vercelの読み取り専用gateで履歴・checksum・必要schemaがすべて一致することを確認してからbuildへ進める。gateをskipしたり、未知の履歴を許可したりしない。

## 検証と公開条件

SQL本文がmainと同一であること、最新migration定数、履歴拒否テストを検証する。公開用PRのCI成功後にproductionへ反映し、本番build内のgate成功、Deployment READY、独自ドメイン、health/ready、ハッシーとマナベルの表示を確認する。

共有ファイルの変更: なし。DB・環境変数・cron・メール送信設定の変更: なし。ローカル診断で一時取得した接続設定ファイルは削除済み。
