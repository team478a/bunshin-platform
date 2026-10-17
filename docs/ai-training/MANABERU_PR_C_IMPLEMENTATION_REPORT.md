# マナベル PR-C 実装報告（v4）

状態: PR #1327は本v4追補作業中に既にマージ済み（2026-10-17 01:07 UTC）。v4追補はDraftフォローアップPR #1328として提出済み。マージ・Production release・feature flag/保持Cron有効化は未実施。

## 1. 調査した内容

- PR #1327のレビューコメントと、最新版の本線化指示書v4・AI進化方針書・決定記録だけを適用。v1〜v3は参照していない。
- 会話本文は`ProgramActionEvent`、途中相談本文も同テーブル、相談画像は`PersonalLearningPracticeSupportImage`、希望・環境・候補は`PersonalLearningRequest`、提出物は`TrainingMissionAnswer`、保存済み活用例は`TrainingToolkitItem`に保存される。
- 本人Exportは会話、途中相談、画像、希望・環境を既に含む。既存の一括削除は同一受講の学習記録を物理削除するが、希望・会話単位の個別削除はなかった。
- 既存保持処理は固定経路用`TRAINING_RETENTION_V1`であり、動的経路へそのまま適用すると決定6に反する。

## 2. 変更したファイル

- `docs/DECISION_LOG.md`: 決定6を記録し、決定1を置き換えた経緯と適用境界を記載。
- `packages/capability-training/src/personal-data-retention.ts`、`test/personal-data-retention.test.ts`: `PERSONAL_LEARNING_DYNAMIC_RETENTION_V1`の期限判定と境界テスト。
- `packages/database/src/training-retention-snapshot.ts`、`training-retention-execution.ts`: `DYNAMIC_V1`だけに適用される既存保持Preview/Execution経路。固定経路の既存処理は分岐前のまま。
- `packages/capability-training/src/personal-data-deletion.ts`、`packages/database/src/training-personal-data-deletion.ts`、`apps/web/src/http/ai-training-personal-data-deletion.ts`、`apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-data-deletion-card.tsx`: 学習テーマ・会話単位の本人削除と既存の一括削除。
- `packages/database/test/personal-learning-persistence.integration-cases.ts`: 共有/取消、運営者閲覧監査、二重送信防止、会話個別削除、期限後の会話・希望削除、活動中の画像のみ削除の実DB統合テスト。
- `apps/web/test/ai-training-personal-data-deletion-http.test.ts`: 個人データ削除APIテストfixture。

## 3. 主要な設計判断

- 適用対象はProgram設定が明示的に`DYNAMIC_V1`のAI研修だけ。固定経路、既存`TRAINING_RETENTION_V1`、サポート案件#1294の90日保持には影響しない。
- 会話、希望・環境・候補、提出本文および途中相談本文は、最後の本人操作から1年または受講終了後90日の早い方で削除する。画像は最終利用に関係なく作成から90日で削除する。構造化プロフィール・進捗・要約系と保存済みToolkitは、終了後1年または本人の最終利用から2年の早い方で削除する。
- 最終利用日時は受講者の会話送信、共有設定、相談・実践・提出等の本人操作イベントと希望/提出の作成日時から算出する。AI応答、運営者操作、システム通知は延長要因にしない。時刻が判定できない場合は削除を急がず、Previewで件数のみを示す。
- 既存のPreview revision確認、受講データロック、同一受講/本人Scope、削除監査を再利用。Previewには本文を出さず、Executionは確認revisionに束縛する。
- 既存`PERSONAL_LEARNING_LESSON_ADMISSION`を内部テストの費用・試行枠として再利用することは、PRレビューコメントで承認済み。別枠の上限を今回増やさない。外部公開前の上限は別途提案する。
- 決定6の30日以内完全削除について、アプリDB上の本人削除はトランザクションで即時反映する。一方、Supabaseのバックアップ保持/物理消去の30日以内完了は、このリポジトリから保証できず未確認として残す。

## 4. 実行した検証

- 期限ユニットテスト: 13 passed（90日/1年/2年の期限到達、期限直前、閏日を含む）。
- Database保持/個人削除テスト: 17 passed。Web削除API/UIテスト: 8 passed。
- WebとDatabaseのTypeScript typecheckが完了し、エラーなし。
- 変更対象ファイルのPrettier checkと`git diff --check`が通過。
- PostgreSQL実データベース統合ケースは追加済みだが、今回差分を含むCI実行は未実施。PR #1327の既存CI成功はマージ前の旧コミットに対する結果であり、今回差分の検証扱いにはしない。

## 5. 未解決事項

- Q&Aへの追加回答から候補提案を再生成し、同一スレッドで実践中相談を継続する処理は、候補revision/AI費用予約/実践の固定版との整合をまたぐためPR-C2へ分離する。PR-C2の範囲はこの2点に限定し、PR-Cのレビュー完了後に着手する。
- LINE受信メッセージ/画像、本人像・構造化要約は後続PRで追加されるデータ種別のため、現行保持処理にはまだ対象行がない。各データ追加PRで同じPreview/Executionと本人Export/削除へ接続する。
- バックアップからの削除が30日以内であること、ProductionでのCron稼働、利用規約/プライバシー文面の専門家確認は未完了。
- PR #1327が先にマージされたため、今回差分は別のDraft PR #1328に提出した。ユーザーのレビュー完了までDraftを維持する。Production release、保持Cron登録・有効化は行わない。

## 6. 次へ進む条件

田中によるDraft PR #1328のレビューと、追加変更を含むCI成功。PR-C2はPR-C変更のレビュー後に別Draftで提案する。Production release/cron有効化は別途明示承認と実動作計画が必要。
