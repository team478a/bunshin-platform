# Manaberu D-2 implementation report

## 1. 調査した内容

- D-1 introduced enrollment-scoped learning topics while wishes, goals, plans, practice assignments, and conversation events were still stored or retrieved at enrollment scope.
- The existing single-topic route is the default. `multiTopic` is explicitly false when omitted, and topic-table access is guarded by the dynamic-program and feature-flag checks.
- Existing D-1 data and legacy single-topic data created after D-1 need to be attached to the initial topic, including conversation events and in-progress practice assignments.

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

## 3. 主要な設計判断

- `multiTopic` remains OFF by default. The existing enrollment URL is unchanged; when multiTopic is ON and exactly one active topic exists, it is selected automatically. With multiple topics, the learner must select one before the learning screen or its APIs are used.
- D-2 migrations assign existing wishes, confirmed goals, plans, conversation history, and in-progress dynamic-practice assignments to the initial D-1 topic. Runtime first-topic creation also adopts only that learner's still-unscoped legacy rows. Values and history are not rewritten or deleted.
- `ProgramMemberGoal.topicId` is nullable to preserve legacy goal behavior. Existing confirmed learning goals are backfilled from their topic confirmation. The active-goal uniqueness constraint remains enrollment-wide for legacy rows and is topic-scoped for D-2 rows, allowing one active goal per topic without changing older routes.
- Requests, lesson candidates, goals, plan revisions, practice assignments and notes, AI admission/body hashes, conversation reads/writes/sharing, and their idempotency identities are constrained by the selected topic. Goal/plan updates first resolve an entity inside that topic. A foreign topic/request/plan fails closed.
- Conversation event reads filter by `topicId` before projecting history. New practice assignment snapshots carry their topic; the migration backfills snapshots for existing in-progress assignments so the one-topic behavior continues after deployment.
- The existing retention/account-deletion lifecycle continues to remove the learner's enrollment-scoped data as a whole; D-2 does not add a per-topic hard-delete workflow. Topic completion/pause remains a scoped status change.
- No service/workspace/user sharing is introduced. D-1 persona items and saved examples remain outside D-2 AI context and are not connected to BunshinMemory.

## 4. 実行した検証

- `pnpm --filter @bunshin/database db:validate` — passed.
- `pnpm --filter @bunshin/database typecheck` — passed.
- `pnpm --filter web typecheck` — passed.
- `pnpm format:check` — passed.
- Focused web tests for request access, request HTTP, conversation, practice, and practice support — 68 passed.
- Topic-boundary and database-readiness unit tests — 9 passed.
- `git diff --check` — passed.
- The database integration case now covers two topics in the same enrollment: independent wishes and conversation projections, identical idempotency keys across topics, cross-topic request/conversation/plan update rejection, and topic-scoped goal/plan reads. It also retains the existing cross-user/service/workspace checks.
- Live PostgreSQL integration tests have not been run locally; they require the disposable integration database used by CI. CI `verify` and `database` are required before review completion.

## 5. 未解決事項

- The first PostgreSQL CI run caught that the legacy active-goal unique index still limited an enrollment to one active goal. D-2 now adds topic scope to learning goals, backfills existing confirmed goals, and preserves the legacy uniqueness rule for rows without a topic. Await the rerun of the database integration suite for confirmation.
- Confirm migration execution order for any eventual release: apply both additive D-2 migrations first, then deploy the program. Do not enable `multiTopic` until both are verified. No production migration, deployment, or flag change was performed for this PR.

## 6. 次Phaseへ進める条件

- `verify` and `database` CI checks are green and the Draft PR review confirms the topic boundaries and one-topic compatibility.
- D-2 remains Draft until the user reviews it. No merge or production action is included in this implementation.
