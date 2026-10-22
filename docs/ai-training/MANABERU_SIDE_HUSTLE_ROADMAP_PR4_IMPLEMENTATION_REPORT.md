# 副業版90日の地図 PR-4 実装報告

作成日: 2026-10-22  
作業ブランチ: `codex/manaberu-side-hustle-roadmap-pr4`  
開始時の`origin/main`: `148de0295e2a6cc5a2b3ebe858ce486ae7f15448`（PR #1383 merge）

## 1. 調査した内容

- PR #1383の副業ヒアリング・提案・選択の保存先と、Enrollmentに紐づくテーマ・希望の作成処理を確認した。
- 開始時にテーマのない希望があれば、既存のテーマ作成処理が記録を移行しうるため、PR-4の開始処理でその状態を検出して`CONFLICT`にする設計とした。自動移行はしない。
- 個人データの出力はEnrollmentの`ProgramActionEvent`をイベント単位で含め、削除・保持期限処理はEnrollmentのイベントとテーマを対象にする既存構造を確認した。地図・開始イベントをその既存対象へ追加した。
- `SIDE_HUSTLE_V1`で`multiTopic`を無効にできないよう、Program設定変更の検証にも制約を加えた。
- DB migrationは追加していない。

## 2. 変更したファイル

### 実装・画面

- `packages/capability-training/src/side-hustle-roadmap.ts`（厳密な地図契約検証、初期希望の組み立て）
- `packages/capability-training/src/index.ts`
- `packages/application/src/personal-learning-text-operation.ts`
- `packages/database/src/personal-learning-text-operation.ts`
- `packages/database/src/side-hustle-hearing.ts`（地図保存・読出し・開始、テーマと初期希望の作成）
- `packages/database/src/training-personal-data-export.ts`
- `packages/database/src/training-retention-snapshot.ts`
- `apps/web/src/ai/openai-task-compatibility.ts`
- `apps/web/src/http/program-feature-flags.ts`
- `apps/web/src/http/side-hustle.ts`
- `apps/web/src/providers/openai-learning-lesson.ts`
- `apps/web/src/providers/openai-side-hustle-roadmap.ts`
- `apps/web/src/providers/personal-learning-offer-policy.ts`
- `apps/web/src/services/side-hustle-roadmap.ts`
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/side-hustle/roadmap/route.ts`
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/side-hustle/start/route.ts`
- `apps/web/app/s/[serviceSlug]/manage/programs/program-feature-flags-card.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/page.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/topic-selector.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/side-hustle/page.tsx`（PR-3bのNOT_FOUND/FORBIDDENをnotFound()へ変換）
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/side-hustle/client.tsx`
- `docs/DECISION_LOG.md`

### テスト

- 新規: `packages/capability-training/test/side-hustle-roadmap.test.ts`
- 新規: `apps/web/test/openai-side-hustle-roadmap.test.ts`
- 変更: `apps/web/test/program-feature-flags.test.ts`（SIDE_HUSTLE_V1の有効化fixtureでmultiTopicを必須にする）
- 変更: `packages/database/test/personal-learning-d.integration-cases.ts`（mockなしで既存DB統合テスト方式を利用し、ヒアリング→提案→選択→地図検証出力保存→読出し→開始→希望読出しを追加）
- 変更: `packages/database/test/side-hustle-hearing.test.ts`（readStateの開始中テーマ参照に対するfindFirst mockを追加）
- 変更: `packages/database/test/training-personal-data-export.test.ts`
- 変更: `packages/database/test/training-retention-execution.test.ts`

### 共有ファイル

- `docs/DECISION_LOG.md`は追記のみ。
- パッケージの公開indexは`packages/capability-training/src/index.ts`に追加exportのみ。
- PR-4用実装報告を追加。

## 3. 主要な設計判断

- 90日の地図は3件の月次目標として検証し、日別の課題は生成しない。
- 地図・開始をEnrollmentの`ProgramActionEvent`に保存する。作り直しは新しい地図イベントとして残し、最新の地図だけを開始対象にする。
- 選んだ副業を`PersonalLearningTopic`として作り、同一トランザクション内で固定形式の初期`PersonalLearningRequest`を版1として作成する。以降は既存の動的学習処理を使う。
- 副業テーマは同時に1件だけACTIVEとし、再選択して開始した場合は以前の副業テーマをPAUSEDにする。既存の別種テーマは自動停止しない。
- テーマのない希望がある場合は開始を拒否し、履歴を副業テーマへ混ぜない。
- 地図生成は既存の学習AI provider runtime・コスト予約・使用記録経路へ追加し、操作種別を分離する。
- 開始前の副業学習画面では希望入力・手動テーマ作成を隠し、開始後は地図カードと既存学習フローを使う。
- `SIDE_HUSTLE_V1`では`multiTopic`を必須設定とし、保存・無効化を拒否する。

## 4. 実行した検証

- Node.js 24.19.0で最終検証を再実行。
- `pnpm format:check`: 成功。
- `pnpm typecheck`: 成功（Turbo 25 tasksとlearning UI typecheck）。
- `pnpm lint`: 成功（アーキテクチャ境界チェックを含む）。既存の未使用eslint-disable警告4件のみ。
- `pnpm test`: 成功。Web・Database・Application・その他全workspaceのsuiteが成功。Database 213 files / 1,065 tests、Application 145 files / 1,026 tests、capability-training 38 files / 610 tests。
- `pnpm build`: 成功（Next.js production build、静的ページ38件生成）。
- `git diff --check`: 成功。
- focused tests: 契約テスト19件、Providerテスト2件、Program設定・HTTPテスト12件が成功。DB repository unit test 3件も成功。
- `pnpm --filter @bunshin/database test:integration`: 使い捨てPostgreSQL 16の一時DBで成功（256 tests passed）。ヒアリングから提案・選択・地図保存・読出し・開始・希望読出しまでのmockなし統合テストを含む。一時コンテナは終了後に削除され、永続DBは変更していない。

## 5. 未解決事項

- PR-5で扱う月次到達点の進捗確認・地図更新は本PRの範囲外。
- LINEでの地図表示、課金、本番反映、Pilot有効化は行っていない。

## 6. 次へ進める条件

- 標準検証がすべて成功し、レビューで差分・運用上の前提を確認すること。
- PRレビューで差分と、PR-5に委ねる進捗ベースの地図更新の境界を確認すること。
- PR-5やPilot有効化へ進む判断は別途行うこと。
