# マナベル D-2 実装報告

## 1. 調査した内容

- D-1で受講単位の学習テーマを導入済みでしたが、希望・目標・計画・実践・会話の読み書きには受講単位の経路が残っていました。
- 既存の1テーマ運用を既定とし、`multiTopic` は未設定時も含めてOFFです。テーマテーブルの参照は、動的学習プログラムかつ対象フラグが有効な経路に限定しています。
- D-1以降に作られた既存データや進行中の実践割当も、初期テーマへ移行する必要がありました。

## 2. 変更したファイル

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261017120000_personal_learning_topic_scope/migration.sql`
- `packages/database/prisma/migrations/20261017130000_personal_learning_goal_topic_scope/migration.sql`
- `packages/database/src/schema-readiness.ts`
- `packages/database/src/personal-learning-d.ts`
- `packages/database/src/personal-learning-persistence.ts`
- `packages/database/src/personal-learning-request.ts`
- `packages/database/src/personal-learning-lesson-candidate.ts`
- `packages/database/src/personal-learning-conversation.ts`
- `packages/database/src/personal-learning-practice.ts`
- `packages/database/src/personal-learning-operation-identity.ts`
- `packages/database/src/personal-learning-text-operation.ts`
- `packages/database/test/personal-learning-d.integration-cases.ts`
- `packages/database/test/personal-learning-d-topic-boundary.test.ts`
- `apps/web/src/services/personal-learning-request-access.ts`
- `apps/web/src/http/personal-learning-request.ts`
- `apps/web/src/http/personal-learning-lesson-candidate.ts`
- `apps/web/src/http/personal-learning-conversation.ts`
- `apps/web/src/http/personal-learning-practice.ts`
- `apps/web/src/http/personal-learning-practice-support.ts`
- `apps/web/src/http/personal-learning-topics.ts`
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/topics/route.ts`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/page.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/topic-selector.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/card.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/conversation-card.tsx`
- `apps/web/test/personal-learning-request-access.test.ts`
- `apps/web/test/personal-learning-unselected-topic-http.integration.test.ts`

## 3. 主な設計判断・今回の修正

- `multiTopic` は初期状態OFFです。1つの有効テーマがある場合は自動選択し、複数テーマがある場合は明示的に選択されたテーマだけで学習処理を行います。
- 今回、`multiTopic` がONなのに有効テーマが0件、または複数件から指定がない場合、`resolvePersonalLearningRequestActor` は `NOT_FOUND` を返すようにしました。希望、会話、実践、候補などの利用APIはテーマ未指定では処理を開始しません。
- 未選択を許すのは、テーマ選択画面の表示とテーマ一覧・作成の経路に限ります。これらはテーマを選ぶ／用意するための境界で、テーマに紐づく学習データの読み書きやAI処理には進みません。
- 新しいHTTP統合テストで、2テーマがある状態の希望・会話・実践・候補APIが`topicId`なしではすべて404になること、テーマ一覧・作成APIは未選択でも利用できることを確認します。サービス層のテストではテーマ0件も`NOT_FOUND`になることを確認します。
- 既存の1テーマ経路は変更せず、`multiTopic` OFF時の処理は従来どおりです。
- D-2の2つのmigrationで、既存の希望、確定済み目標、計画、会話履歴、進行中の動的実践割当を初期テーマへ紐づけます。値や履歴は書き換え・削除しません。初期テーマ作成時も、その受講者の未紐づけデータだけを移行します。
- `ProgramMemberGoal.topicId` は旧データとの互換性のためNULLを許容します。D-2で作られる目標はテーマ単位で一意にし、従来データの動作を維持します。
- AI入力、更新、削除、確認、会話共有、冪等性キーは選択テーマ内に制限します。他テーマの希望・計画等を参照する要求は拒否します。
- 会話履歴はテーマで絞ってからAI入力に投影します。実践割当の既存スナップショットもmigrationでテーマに紐づけ、1テーマ時の動作を維持します。
- 保存期間とアカウント削除は既存の受講単位データ削除ライフサイクルを維持します。D-2ではテーマ単位の完全削除機能を追加せず、テーマの終了・停止は対象テーマの状態変更として扱います。
- 他サービス・ワークスペース・ユーザーとの共有は行いません。D-1の本人像・保存例はD-2のAI入力にもBunshinMemoryにも接続しません。

## 4. 実行した検証

- `pnpm --filter @bunshin/database db:validate` — 成功
- `pnpm --filter @bunshin/database typecheck` — 成功
- `pnpm --filter web typecheck` — 成功
- `pnpm format:check` — 成功
- 今回の変更を含むアクセス境界・希望API・候補API・会話API・実践APIのWebテスト5ファイル — 47件成功
- 今回の追加HTTP統合テスト — 2件成功（2テーマ状態で希望／会話／実践／候補の未指定を拒否、テーマ一覧／作成は許可）
- テーマ境界とDB readinessの単体テスト — 9件成功
- `git diff --check` — 成功
- DB統合テストでは、同一受講の2テーマ間の希望・会話の独立性、同じ冪等性キーの分離、テーマをまたぐ希望／会話／計画更新の拒否、テーマ単位の目標・計画参照を確認します。従来のユーザー／サービス／ワークスペース境界テストも維持しています。
- PostgreSQL統合テストはCIの使い捨てDBで実行し、本番DBやローカルの実DBには接続していません。
- 修正後のGitHub Actions run [39028544870](https://github.com/team478a/bunshin-platform/actions/runs/39028544870) — `verify` 成功（format、typecheck、lint、全テスト、learning UI、build）、`database` 成功（migration/readiness、PostgreSQL統合テスト）。

## 5. 未解決事項・本番反映

- 本番適用時は、D-2の2つのmigrationを先に適用し、DB状態を確認してからプログラムを反映します。`multiTopic` の変更は別途承認があるまで行いません。
- 今回、本番migration、デプロイ、フラグ変更は行っていません。

## 6. 次へ進む条件

- 今回の変更を含む`verify`と`database` CIが成功し、テーマ境界と1テーマ互換性のレビューが完了すること。
- PR #1332はDraftのまま、ユーザー確認前にマージ・本番反映しません。
