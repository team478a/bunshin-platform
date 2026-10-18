# マナベル保存期間Cron実装報告

## 目的と状態

本報告は、D-1〜PR-Fで導入された保存期間処理を、明示設定された本番Programに限定して日次実行できるようにする変更を記録する。変更はDraft PRとしてレビューに出す。本番DB、Vercel本番設定、環境変数、Cronの手動実行、機能フラグは変更していない。

## 調査した内容

- `PrismaTrainingRetentionExecutionRepository` が受講単位のPreview・改訂番号照合・トランザクション削除・件数だけの`TRAINING_RETENTION_APPLIED`監査を実装済みであることを確認した。
- `trainingRetentionOwner` がSUPER_ADMINの有効性、Workspace/Group/Enrollment/Membership、AI_TRAINING_V1 Programを再確認することを確認した。
- LINE本文と画像、動的テーマ・本人像・抑止記録・保存例、従来の固定研修データは既存Retention Snapshot/Executionで扱われる。Cron用の別削除SQLや別の保持期間は追加しない。
- `authorizeCronRequest` と `CRON_SECRET` を使う既存の認証付きCronパターン、`apps/web/vercel.json` の既存定義を確認した。

## 変更したファイル

- `packages/capability-training/src/personal-data-retention.ts`
- `packages/database/src/training-retention-snapshot.ts`
- `packages/database/src/training-retention-execution.ts`
- `packages/database/src/training-retention-cron.ts`（新規）
- `packages/database/src/index.ts`
- `packages/database/test/personal-learning-d.integration-cases.ts`
- `apps/web/src/http/ai-training-retention-cron.ts`（新規）
- `apps/web/app/api/internal/ai-training/retention-cron/route.ts`（新規）
- `apps/web/test/ai-training-retention-cron.test.ts`（新規）
- `apps/web/vercel.json`
- `docs/ai-training/MANABERU_RETENTION_CRON_IMPLEMENTATION_REPORT.md`（本書）

## 設計・安全性

1. 毎日03:00 JST相当（Vercel UTC Cron `0 18 * * *`）に認証付きGETを追加した。実行先はNode.js runtime、最大実行時間300秒。
2. `CRON_SECRET` によるBearer認証を必須とする。Cron以外の呼出し、Production以外での実削除はできない。
3. 対象は環境変数`PERSONAL_LEARNING_RETENTION_SCOPES`に明記された`workspaceId`・`groupId`・`serviceProgramId`の組だけ。DB側でProgramとAI_TRAINING_V1 module key、所属Enrollmentを再検証する。Programをまたぐ曖昧なGroup全体削除はしない。
4. `PERSONAL_LEARNING_RETENTION_EXECUTION_ENABLED`が厳密に`true`で、かつ`APP_ENV=production`のときだけ削除を許可する。未設定・false・不正値・他環境は件数確認のみ。スコープ未設定時はDBを読まず、`NOT_CONFIGURED`を返す。初期状態はOFF。
5. Previewと実行には、既存の`PERSONAL_LEARNING_RETENTION_OPERATOR_USER_ID`として指定した有効なSUPER_ADMINを使う。Programの対象者としての権限を新設しない。
6. 実行前に全対象Enrollmentの件数を取得し、上限100件を超える実行は削除前に拒否する。各Enrollmentの削除直前にも最新Snapshotを再取得し、そのrevisionを既存のEnrollment lock/CASへ渡す。削除後は同じEnrollmentを再Previewし、期限到来データが残れば成功扱いにしない。
7. Cron全体にPostgreSQL transaction advisory lockを使い、重複Cronは`ALREADY_RUNNING`で停止する。個別削除は既存のEnrollmentロック・30秒トランザクションを維持し、Cron全体は240秒、Vercel関数は300秒で上限を設ける。時間予算に到達した場合はそれ以上開始せず、処理済みEnrollmentの監査を残して次回へ送る。
8. 各実削除の既存ProgramAuditLogへ件数、実行時刻、Enrollment/Program/Workspace/Group範囲、ポリシー版、`executionSource=CRON`を保存する。回答本文、LINE本文、画像、プロフィール内容はログに含めない。Previewはログへ件数だけを記録する。
9. migrationは不要。DB列を増やさず、既存の監査列とRetention stateを使用する。

## 運用時の設定（このPRでは設定しない）

1. Vercel Productionの`CRON_SECRET`が既存Cronと共通で設定されていることを確認する。
2. `PERSONAL_LEARNING_RETENTION_OPERATOR_USER_ID`へ有効なSUPER_ADMINのUser IDを登録する。
3. `PERSONAL_LEARNING_RETENTION_SCOPES`へ運用承認済みProgramのID組だけをJSON配列で登録する。すべての研修ProgramやGroupを暗黙対象にしない。
4. 削除を許可する前に、まず`PERSONAL_LEARNING_RETENTION_EXECUTION_ENABLED`を未設定または`false`のままにしてPreview結果・件数・対象Programを確認する。
5. 田中が対象範囲と件数を確認した後に限り、別途承認を得て本番Execution設定を`true`にする。このPRのマージやCron登録はその承認ではない。
6. 停止時は同設定を`false`または未設定へ戻す。既存データのMigration rollbackは行わない。

## テスト

- HTTP: Cron認証、スコープ未設定時にDBを読まないこと、既定Preview、正確な本番Execution opt-in、環境外実行の無効化、重複/不正スコープ拒否を確認。
- DB統合: Previewでは削除されないこと、90日超画像だけが削除されること、最近の画像・本文が残ること、許可外Programの期限超過画像が残ること、監査がCRON範囲・件数のみで本文を含まないことを確認。
- ローカル確認: HTTPテスト5件成功、Retention Preview/Execution既存ユニットテスト22件成功、Database/Web型検査を実行、対象ファイルPrettier検査成功、対象ESLintと`git diff --check`成功、Vercel JSON parse成功。
- ローカルDB統合テストは安全な使い捨てDB接続が存在せず、preflightが0件実行で拒否した。Productionや別DBへ接続していない。統合テストの成功はDraft PRの専用Postgres CI結果で追記する。

## 未解決・次の条件

- 100 Enrollmentを超える単一実行スコープはfail-closedで拒否する。大規模Programがある場合は、本番運用開始前に安全な分割カーソル/バッチ設計を別途レビューする。
- Vercel Cronの実設定・実行、Preview結果の運用確認、ExecutionスイッチON、保存期間削除、外部公開はいずれも未実施。
- 田中のコードレビュー・Draft確認後にのみマージ可。ProductionのExecution有効化は別途明示承認が必要。
