# マナベル PR-D-4 実装報告：保存活用例・本人Export・保存期間

状態：Draft。D-4のレビュー待ち。本番migration適用・プログラム反映・`multiTopic`変更・保持Cron有効化は行っていない。

## 1. 調査した内容

- D-1で作成済みの`PersonalLearningSavedExample`、テーマ、本人像、本人像の再推測抑止データを確認した。保存例テーブルと権限付きRepositoryは存在したが、受講者用UI/API、Export、一括削除、動的保持期限処理への接続が不足していた。
- 既存の本人Exportは受講単位JSON、一括削除は同一受講のPreview revisionを使う構成だった。運営向け保持Previewは件数のみを表示し、固定研修と動的研修のルール説明が分かれていなかった。
- 決定6を適用。決定1の「会話・提出・画像を作成から90日で削除」は使用しない。動的経路には`PERSONAL_LEARNING_DYNAMIC_RETENTION_V1`を適用する。

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/examples/page.tsx`、`examples/saved-examples.tsx`: 本人専用の活用例一覧・保存・削除画面を追加。
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/personal-learning/examples/route.ts`、`apps/web/src/http/personal-learning-saved-examples.ts`: 本人認証・同一Service/Workspace/User・有効な動的受講・`multiTopic` gateを通したAPIを追加。保存内容はタイトル160文字、本文8,000文字まで。利用者作成の保存例として記録し、ID以外の他ユーザー指定を受け付けない。
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/page.tsx`: 学習画面から活用例と本人像画面へのリンクを追加。動的経路では既存の本人Export・一括削除カードも表示し、動的画面からも退会/データ持ち出しに到達できるようにした。
- `packages/capability-training/src/personal-data-export.ts`、`packages/database/src/training-personal-data-export.ts`: D-1のテーマ、本人像、再推測抑止、保存例を、同一受講の本人Export JSONへ追加。新しいD系テーブルは`DYNAMIC_V1`かつ`multiTopic` ONのときだけ読み込む。件数・ファイルサイズ上限は既存Export規則を維持。
- `packages/capability-training/src/personal-data-deletion.ts`、`packages/database/src/training-personal-data-deletion.ts`: Preview revisionにD系レコードID・更新日時を束縛し、本人一括削除でテーマ、本人像、再推測抑止、保存例を削除。フラグOFFまたは固定研修ではD系テーブルに触れない。
- `packages/database/src/personal-learning-d.ts`: テーマ・本人像・活用例を本人が閲覧した時に`lastLearnerUseAt`を更新し、動的保持期限を延長する。
- `packages/database/src/training-retention-snapshot.ts`、`training-retention-execution.ts`、`training-retention-preview.ts`、`apps/web/app/s/[serviceSlug]/manage/training/retention/retention-summary.tsx`: 決定6に沿った期限判定と削除対象に、テーマ・本人像・抑止記録・保存例を追加。運営向けPreviewには内容を表示せず、件数と保持ルールだけを表示する。
- `apps/web/test/personal-learning-saved-examples-ui.test.tsx`、`packages/database/test/personal-learning-d.integration-cases.ts`、`personal-learning-persistence.integration-cases.ts`: 画面、境界、Export・一括削除、期限削除を検証するテストを追加。

## 3. 主要な設計判断

- 保存例はログイン中の本人が自分で作成・保存・削除する。別ユーザー、別Workspace、別Serviceのデータへアクセスできない。運営者の画面には本文を表示しない。
- Exportは既存の本人用JSONにD-1データを加える。一括削除も既存のPreview/確認revision/トランザクション境界を再利用するため、追加の削除経路を作らない。
- 動的研修の会話・希望・提出は「最終本人操作から1年、または受講終了から90日の早い方」、相談画像・LINE受信画像は作成から90日、テーマ・本人像・保存例は「最終本人利用から2年、または受講終了から1年の早い方」。削除判断に使う本人操作は既存の受講単位集計を維持し、システム通知・運営者操作・AI応答では延長しない。
- D系テーブルの読取・更新・削除は`DYNAMIC_V1`かつ該当フラグ`multiTopic`がONの場合だけ。`multiTopic`の初期状態はOFFのまま。
- D-4で新規migrationは追加していない。D-1（20261017100000）、D-2（20261017120000、20261017130000）、D-3追補（20261017140000）のDB構造が先に必要。本番反映を別途承認された場合も、未適用migrationを適用・検証してからプログラムを反映する。保持Cronの有効化、Production DB変更、Deploy、feature flag変更は本PRに含めない。

## 4. 検証

- `git diff --check`: 成功。
- Prettier: 変更対象を整形済み。
- `pnpm --filter @bunshin/database exec tsc --noEmit`: 成功。
- `pnpm --filter @bunshin/capability-training exec tsc --noEmit`: 成功。
- `pnpm --filter web exec tsc --noEmit`: 成功。
- Database関連ユニットテスト: 3ファイル24テスト成功（保持Preview、Export、テーマ境界）。
- Capability Training関連ユニットテスト: 2ファイル18テスト成功（保持・Export・削除規則）。
- Web関連ユニットテスト: 2ファイル14テスト成功（保存例UI、運営保持画面）。
- Prettier check、`git diff --check`: 成功。
- DB統合テストには、D系データを含めた本人Export・一括削除・保持期限削除、および別ユーザー等の境界ケースを追加した。統合テストとCI `verify` / `database` はDraft PR上で実行し、結果を追記する。使い捨てPostgreSQLを使い、本番DBには接続しない。

## 5. 未解決事項・次の条件

- Supabaseのバックアップや外部Provider、利用者が端末へ保存したExportの物理消去は、このPRから保証できない。決定6の30日以内完全削除目標の運用証拠は別途必要。
- 保持CronのProduction有効化は別承認と、本番での実動作証拠が必要。今回有効化しない。
- Draft PRの差分・日本語報告・CIを田中が確認するまでマージしない。本番migration適用・Deploy・`multiTopic`変更も個別の明示承認前には行わない。
