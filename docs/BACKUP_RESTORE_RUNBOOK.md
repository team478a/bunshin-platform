# Backup / Restore Runbook

## 目的

本番DB変更前に復元可能性を確認する。Secret、個人情報、DB dumpをGitHub Issueやリポジトリへ保存しない。

## 通常方針

- Supabase Proの日次backupを使用し、Dashboardで最終成功時刻と保持期間を確認する。
- migration前に最新backupが存在することを環境ownerとmigration実行者の2者で確認する。
- Productionへのrestoreは障害責任者の承認なしに開始しない。
- migrationを巻き戻すために適用済みmigrationファイルを書き換えない。原則forward-fixとする。

## Restore rehearsal

1. 対象backup日時、対象project、担当者を記録する。Secretは記録しない。
2. Productionとは別の隔離projectへ復元する。既存Productionへ上書きしない。
3. migration status、主要table件数、代表的なFK、`/api/health/ready`相当のDB queryを確認する。
4. テスト終了後、隔離projectの保持要否を判断し、不要なら環境ownerが削除する。
5. 実施日時、RTO、復元対象時刻との差（RPO）、合否だけをProduction Gateへ記録する。

## 本番障害時

非互換migration適用後は「既知正常deployment」の旧DB互換性を再確認する。特にFeedback maintenanceのNULL主体移行後、旧アプリだけのpromoteは安全なrollbackではない。[専用Runbook](improvement/IMPROVEMENT_MAINTENANCE_RELEASE_RUNBOOK.md)に従い、runを含む起動停止と新契約対応版の維持を優先する。復元は消去済みFeedback/本人参照を復活させ得るため、復元元日時以降の本人削除・退会・保持期限超過の再適用を確認するまで公開/自動処理を再開しない。再適用根拠が不足する場合は推測せず停止する。

1. 書き込み停止またはVercel Production pauseの必要性を判断する。
2. 直前deployment、migration run、Supabase statusを確認する。
3. code rollbackで解消可能ならVercelの既知正常deploymentをpromoteする。
4. DB restoreが必要な場合だけ環境ownerがSupabase Dashboardから実施する。
5. restore後にmigration status、live、ready、認証、代表read/writeを確認する。

## 実施記録テンプレート

- 実施日時:
- 担当者 / 承認者:
- Backup日時:
- 復元先（識別子のみ）:
- RPO / RTO:
- migration status:
- 検証結果:
- Go / No-Go:
