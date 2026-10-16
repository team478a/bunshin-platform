# Manaberu Training Home Guard Extension

Date: 2026-10-16

## Purpose

Prevent AI Training participants from entering social-post partner creation through onboarding, direct URLs, or SNS diagnosis, and use training-specific wording in service launch readiness.

## Service classification

A service is AI Training when it has a `ServiceProgram` whose `settings.moduleKey` is `AI_TRAINING_V1` and whose status is not `ARCHIVED`. This is separate from whether a learning program is currently runnable. The server determines the service type and passes the result to the onboarding form.

## Participant paths

- After initial onboarding is saved, AI Training redirects to `/s/{slug}/home`.
- Direct `/s/{slug}/bunshins/new` and `/s/{slug}/diagnosis` access redirects to the service home for AI Training.
- Other services retain the existing diagnosis and social partner creation behavior.

## Operations copy

For AI Training services, the “最初の質問” launch-readiness description explains that questions prepare personalized learning content from a participant's goals and experience. Other services retain the SNS partner wording.

## Verification

- Focused Vitest: 18 tests passed, including routing-boundary and readiness-copy cases.
- Web TypeScript typecheck: passed.
- Changed-file ESLint: passed.
- `git diff --check`: passed.
- CI and production deployment are pending the PR review/merge and production rollout gates.
- No production DB/program/enrollment/pilot state was changed.
