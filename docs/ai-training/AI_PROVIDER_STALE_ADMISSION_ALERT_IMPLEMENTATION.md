# AI費用予約の未精算通知 実装報告

## 1. 調査した内容

- 運営者向けの「運用通知」画面は `GetAdminAlerts` と `PrismaAdminAlertRepository` の集計を表示する。
- 共通AI Provider予約は既に15分超の未精算件数を表示していたが、Personal Learning専用の `personal_learning_call_admissions` はその集計に含まれていなかった。
- Personal Learningの新しい声かけ専用予約（N-2）は、既存の同テーブルへ予約を記録することを監視側との接続契約とする。よって新しい予約種別も同じ未精算検知で拾える。

## 2. 変更したファイル

- `packages/application/src/admin-alert-center.ts`
  - Personal Learningの未精算件数をスナップショットに追加し、件数があるとき警告を組み立てる。
- `packages/database/src/admin-alerts.ts`
  - 現在時刻より15分以上古く、未精算のPersonal Learning予約を件数だけ集計する。
- `packages/application/test/admin-alert-center.test.ts`
  - 新しい警告の表示を確認する。
- `packages/database/test/admin-alerts.test.ts`
  - 15分超の未精算だけを数える検索条件を確認する。
- `packages/database/test/personal-learning-d.integration-cases.ts`
  - 実DBで古い未精算、精算済み、新しい予約、およびN-2の声かけ種別を含む予約を作成し、運用通知の件数と識別情報非表示を確認する。
- `docs/ai-training/MANABERU_PRODUCTION_LEARNING_FLOW_GAP_REPORT.md`
  - 復元元Backupの来歴証明をPR-Gの外部公開前チェックへ追加。
- `docs/DECISION_LOG.md`
  - 未精算通知の安全境界とN-2予約を含める台帳契約を記録。

## 3. 主要な設計判断

- 運用通知センターを開いた時点で集計し、15分超の未精算予約をWARNINGとして表示する。新しいCron、外部通知先、Migrationは追加しない。
- 共通Provider予約に加え、Personal Learningの費用予約を別の汎用集計として表示する。N-2の声かけ専用予約は `PersonalLearningCallAdmission` を再利用し、通常会話等と同じく件数だけ監視する。
- 通知には予約ID、操作ハッシュ、User/Workspace/Program、operationContext、入力/出力を含めない。
- 15分経過、警告表示、集計成功を、費用精算・予約解放・復旧の根拠にしない。確認後の復旧は既存の管理手順で実行記録と照合して行う。
- 新しいテーブル読み取りや機能フラグを追加せず、既存の安全台帳を読み取り専用で集計する。本番設定・データは変更しない。

## 4. 実行した検証

- `packages/application` のalert-centerテスト: 11 tests PASS。
- `packages/database` のadmin-alerts単体テスト: 1 test PASS。
- `@bunshin/application` と `@bunshin/database` のtypecheck、変更対象のESLint、Prettier、`git diff --check`: PASS。
- 隔離PostgreSQL上の `pnpm test:integration` が成功し、統合テスト `surfaces stale learning and nudge-specific reservations in the operations center` を含むdatabase jobがPASS（GitHub Actions run #39188562375）。同jobの `db:validate` と `db:assert-ready` もPASS。
- GitHub Actions run #39188562375: `CI / verify` 成功（format、typecheck、lint、test、learning UI、buildすべて成功）、`CI / database` 成功（migration readinessと統合テスト成功）。

## 5. 未解決事項

- 声かけ専用の予約をN-2で `PersonalLearningCallAdmission` に記録すること。別台帳にする設計へ変更する場合は、本通知集計への接続を同じPRに含める。
- 10/18の本番直接適用は事前検査タイムアウトではなく、確認後に `DIRECT_MIGRATION_APPLIED_AND_VERIFIED: schema is up to date` を返した記録がある。ただし、復元元Backupの識別子・取得時刻・復元先との来歴は証明できていない。`MANABERU_PRODUCTION_LEARNING_FLOW_GAP_REPORT.md` に記録したとおり、PR-Gの外部公開前までUNKNOWN/未完了のまま保持する。

## 6. 次へ進む条件

- `CI / verify` と `CI / database` が成功し、本報告の検証欄を実際の実行結果で更新する。
- N-2が声かけ専用予約を共通Personal Learning Admission台帳へ保存するか、別台帳にした場合はこの警告に接続する。
- 本番のMigration、デプロイ、設定変更、機能フラグ変更は行わない。これらは田中の別承認後に実施する。
