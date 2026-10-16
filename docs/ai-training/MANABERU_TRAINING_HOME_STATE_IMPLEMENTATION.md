# Manaberu Training Home State Fix

Date: 2026-10-16

## Investigation

- The screenshot's generic “投稿パートナーを作る” page is the social Bunshin creation route.
- The service home identified AI Training only when its `AI_TRAINING_V1` program was `ACTIVE`. The reserved Manaberu pilot program is intentionally `SUSPENDED` before pilot approval, so the service fell through to the social home and generic creation form.
- Direct access to `/s/[serviceSlug]/bunshins/new` also rendered the generic form without checking the service program type.

## Changes

- Recognize `AI_TRAINING_V1` programs in `ACTIVE` or `SUSPENDED` state as AI Training service identity; do not classify `DRAFT` or `ARCHIVED` programs as current service identity.
- Determine learning readiness separately. Ordinary AI Training programs require `ACTIVE`; the reserved pilot additionally requires the existing member enrollment and `resolvePersonalLearningPilot` authorization.
- While unavailable, show “AI研修の準備中です。開始のご案内をお待ちください。” and hide learning links.
- Redirect direct social Bunshin creation access for AI Training services back to the service home.
- Preserve normal social behavior for other services.

## Files

- `apps/web/src/services/personal-learning-service-mode.ts`
- `apps/web/app/s/[serviceSlug]/home/page.tsx`
- `apps/web/app/s/[serviceSlug]/home/service-home-overview-sections.tsx`
- `apps/web/app/s/[serviceSlug]/home/service-home-navigation-sections.tsx`
- `apps/web/app/s/[serviceSlug]/bunshins/new/page.tsx`
- `apps/web/test/personal-learning-service-mode.test.ts`
- `apps/web/test/service-home-module-boundary.test.ts`
- `docs/DECISION_LOG.md`

## Verification

- Focused Vitest: passed (2 files, 8 tests).
- Web TypeScript typecheck: passed.
- Changed-file ESLint: passed.
- `pnpm --filter web build`: passed, including production compilation, type validation, and static page generation.
- `git diff --check`: passed.
- Full repository lint was not completed; the targeted changed-file ESLint check passed.
- No production DB, program status, enrollment, environment flag, or pilot launch state was modified.

## Next gate

Review and merge this UI correction, deploy using the normal production rollout procedure, then verify Manaberu's training home in production. This fix does not authorize or start the closed pilot; the pilot runbook's separate readiness and approval gates remain required.
