# マナベル一般登録研修の本番設定変更

日付: 2026-11-04

## 1. 調査した内容

PR #1467マージ後、mainの読み取り専用監査run `41664393472`を再実行した。DB変更は0件。

- `manaberu-style`は引き続きPUBLIC登録。
- ACTIVEな「マナベルスタイル AI研修30日」は1件、無料GUIDED Offeringは1件。
- 対象ProgramにPersonal Learning Pilot設定・参加枠・Enrollment・seat・AI同意はない。
- ACTIVEな一般参加者2名は、どちらも有効な研修Enrollmentがない。
- 既存の停止中Personal Learning内部テストProgramとその1名枠は別Programとして維持されている。
- Production Providerは既存の日次・月次予算上限、停止制御、資格情報検証を保持している。

## 2. 変更したファイル

- `packages/database/prisma/migrations/20261104010000_enable_manaberu_public_training/migration.sql`
- `packages/database/src/schema-readiness.ts`
- `packages/database/test/manaberu-public-training-migration*.ts`
- `packages/database/test/database.integration.test.ts`

## 3. 主要な設計判断

- 対象はWatashi Worksのcanonical Workspace/Groupに属するACTIVEな「マナベルスタイル AI研修30日」1件だけとする。slug、固定scope、Program名、module key、Offering状態が一致しなければ停止する。
- `trainingAutoAdmission`で対象Program/Offeringを明示し、INTERNAL定員を100名とする。EXTERNAL枠は0、current waveも0のままにする。
- 現在のACTIVE一般参加者2名には、EnrollmentとINTERNAL seatだけを補完する。氏名・メール・回答はmigrationで参照しない。
- `AiTrainingUsageConsent`は作成しない。既存2名も新規利用者も、本人同意前はProviderを利用できない。
- 通知と延期リマインダーをfalseにし、既存のLINE・別サービスへ学習通知を混在させない。
- 既存Program設定とonboarding設定の他fieldは保持する。停止中の内部テストProgram、Offering、Provider予算、千ノ国、ハッシー、副業版は変更しない。
- 部分設定、既存Enrollment/seat、100名超過、対象重複を検出した場合はmigration全体をロールバックする。完全適用済みの場合だけ冪等に成功する。
- 本番Apply runnerはこのPRに含めず、今回のmigration 1件だけを許可する別PRとして扱う。

## 4. 実行した検証

- Prisma schema validation
- migration静的境界テスト3件
- PostgreSQL 16の使い捨てDBへ全273 migrationを適用
- 実データ相当fixtureでACTIVE参加者2名を補完し、同じmigrationを2回実行
- 再実行後もEnrollment 2件、INTERNAL seat 2件、Program/Service監査各1件、AI同意0件であることを確認
- TypeScript typecheck

## 5. 未解決事項

- 本番migrationのPreview/Applyは未実行。
- 本番アプリの再デプロイは未実行。
- migration適用後の読み取り専用再監査と、テスト利用者による本人同意・研修開始確認は未実施。
- 実利用時の100名枠に対してProvider予算が十分かは運用観測が必要。既存予算上限を超えるProvider呼び出しは引き続き拒否される。

## 6. 次Phaseへ進める条件

1. 本PRをレビュー・マージする。
2. 今回のmigration 1件だけを許可する専用Preview/Apply runnerを別PRでレビュー・マージする。
3. 専用workflowを`preview`で実行し、pending集合が今回1件、対象2名、同意作成なしであることを確認する。
4. 同じworkflowを別途`apply`承認し、schema readinessを成功させる。
5. 読み取り専用監査で一般参加者2名のEnrollment/seat、同意0件、設定有効を確認する。
6. アプリをデプロイし、テスト利用者で「公開登録→本人同意→研修開始」を確認する。
