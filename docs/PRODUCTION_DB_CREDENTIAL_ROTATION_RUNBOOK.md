# Production DB credential rotation — reviewed release only

2026-10-08 / status: preparation only, NO-GO for Reset / merge / Deploy.

## Scope and release identity

- Repository: `team478a/bunshin-platform`; Vercel project: `bunshin-platform-web`.
- Baseline: last verified Production SHA `4e2bc01eb0bb1181bcd967d3324c30448ebfaa72`, also `origin/production` at preparation time. Reverify live deployment immediately before any operation; Git branch equality is not live deployment proof.
- Branch: `codex/production-credential-rotation`; PR base: `production`, **Draft**. Merging starts Production Git deployment. Do not merge just to approve the design.
- Supabase project: `vtkzinaudznwbsjoyszk`; DB / role: `postgres`. Session pooler: `aws-0-ap-northeast-1.pooler.supabase.com:5432`.
- No app source, schema, migration, lockfile, Runtime, Provider, Pilot, LINE or Cron definition change. No migration is applied by this release build. Normal feature releases remain separate.
- Non-secret changes: build runs `cd ../.. && pnpm db:assert-ready && pnpm turbo run build --filter=web --force`; ignore command is `exit 1` (continue build). The existing schema gate must pass; do not remove it to make a build pass.
- These contract tests inspect configuration and scripts, not an actual Vercel build or proof of every possible build-time side effect. A production-connected build is not executed during preparation.

## Why ordinary Redeploy / rollback is not sufficient

Environment updates apply to new deployments, not existing deployments. The checked-in `vercel.json` overrides the dashboard build command. Ordinary baseline/main builds run `db:migrate:vercel`; this dedicated source configuration removes that invocation without pretending `VERCEL_ENV` is preview. Do not use API projectSettings overrides as a proven escape from checked-in configuration.

Old deployment credentials stay old after rotation. Rollback to an old deployment alone will not restore access. Unknown old password cannot be used as a recovery plan. DB backup / restore is not assumed to restore authentication secrets.

## Preconditions — no mutation until all reviewed

1. Human approves the credential rotation, downtime, secret replacement and this exact release separately from PR review. Record operator, second reviewer, work window and release SHA.
2. Identify every consumer of the `postgres` password: Vercel Production runtime/build, external workers, trusted scripts, integrations and local tools. Repository confirms Prisma `DATABASE_URL` / `DIRECT_URL`; external consumers and team/integration environment overrides remain **UNKNOWN** until the owner confirms. Supabase Auth/API keys are separate; do not rotate those indiscriminately.
3. Verify latest successful backup, accepted recovery-point loss, restore evidence and recovery owner. Recheck schema/history against baseline; baseline latest migration is `20261006140000_personal_learning_pilot_seat`. Record all pending, failed or partially applied migrations without applying them.
4. Preserve non-secret connection parameters: runtime pooled URL (normally transaction pooler 6543), migration direct URL and explicit session host, SSL/query options. Do not copy the probe-only equal-URL setup blindly into Production. New password is stored by the human in a password manager, percent-encoded exactly once in URI credentials; never chat, commit, command-line argument or logs.
5. Confirm ability to update both Production env names, secret scopes/overrides and deployment ownership. Inspect metadata only; no secret reveal. Do not copy Production secrets to Preview. Prepare a new deployment with current project settings/secrets except reviewed DB credentials; disable existing build cache during actual release.
6. Verify CI on this dedicated PR and all diff paths against baseline. Confirm official domain and old deployment access-stop plan. Project pause alone previously left an older deployment URL accessible; approved firewall coverage and Cron stop/drain are separate controls.

## Human-approved execution sequence (not performed by this PR)

1. Reconfirm baseline/live SHA, backup and approved release diff. Stop new traffic on every accessible deployment, stop Cron and external writers; verify in-flight requests, DB sessions/jobs and Provider work have drained. An instantaneous zero count is not sufficient proof of full drain. Do not delete data or unlock unknown jobs.
2. Human opens Supabase **Database > Settings** and performs password Reset only after the above and explicit authorization. This affects existing postgres consumers; keep maintenance in place.
3. Human updates Vercel **Production** `DATABASE_URL` and `DIRECT_URL`, preserving their respective connection modes/options. Keep `SUPABASE_SESSION_POOLER_HOST` matched to Connect. Update identified external consumers, not just Vercel. Environment Save is not runtime activation.
4. Safely inject credentials into the previously reviewed probe runner from main `5350de139e0af99b1b47265fe37297f06c17be66` (or a separately reviewed successor). This baseline branch predates `db:migration:probe`; do not run its normal migration runner as a probe. Use Node 24 / Prisma 6.19.3 dedicated read-only entrypoint, target ref and bounded settings. Require exit 0 / `MIGRATION_CONNECTION_PROBE_PASSED`; failure stops execution. Local success is not Vercel connectivity proof. Do not repeatedly retry pooler authentication errors without operator-reviewed diagnosis.
5. At the approved release point, merge this reviewed PR to `production` to start its dedicated deployment. This departs from normal main-to-production feature release deliberately; never merge main into this branch. Ensure actual build metadata/command matches the migration-free command, source SHA is approved, build cache is off, readiness gate passes and no migrate deploy step ran. Keep all traffic/Cron stopped through build; Resume Project/domain assignment order must be verified by the operator for the actual Vercel project (pause can block domain assignment).
6. Require READY and official domain assigned to the new release. Read-only `/api/health/live` and `/api/health/ready` must pass including DB/schema. Then human-approved minimal auth/Existing V1 smoke verifies application access. Do not trigger assessment/generation, paid calls, LINE sending or Pilot START during this credential release.
7. Human approves resuming traffic and then Cron/external consumers. Record timestamps, deployment ID/SHA, checks, errors and restored controls. Pilot remains disabled. Monitor DB auth failures, 5xx, job errors and old deployment URLs. Retire temporary plaintext credential files through an explicitly approved exact-path cleanup after secret retention is confirmed.

## Stop and recovery

- Stop on backup/consumer UNKNOWN, schema mismatch, unexpected migration, non-approved SHA, stale env scope, probe failure, build failure, missing domain or auth failure. Maintain maintenance; do not automatically reset again, migrate, resolve history, restore DB or delete records.
- Before Reset: abort and restore approved traffic/Cron controls without changing credentials.
- After Reset: old release alone is unusable as rollback. Correct the credential injection/scope/encoding after human review and rebuild this approved baseline configuration using the new password. Recheck connection/schema before reopen. Another rotation or DB restore is a separate decision; do not promise zero downtime or a fixed recovery time.
- If build reveals unrelated baseline failure, do not silently pull main. Report the blocker and obtain approval for the smallest repair.

## Return to normal feature releases

This production configuration is temporary and must not become a generic migration bypass. Before the next feature release, reconcile this hotfix through a reviewed main-to-production PR and restore main's Migration + schema-gate build and ordinary ignore command. Remove or replace the release-specific `credential-rotation-release.test.ts` assertions in that reviewed restoration PR; do not retain a migration-free build merely to satisfy them. Inspect the merge diff rather than accepting this branch's build command in a conflict. Main's OEM pending migrations need their own backup/drain/compatibility gates. Password rotation success does not authorize them, billing cutover, Pilot enable or Provider use.

## Preparation validation

- Release contract: 5 tests passed; existing baseline Migration runner: 6 passed; existing Web deployment/Cron/lifecycle boundary suites: 9 files / 57 passed (68 total targeted tests).
- Architecture boundary check, scoped TypeScript test lint, changed-file Prettier and `git diff --check` are checked separately. Full monorepo checks / test DB integration belong to PR CI; no Production-connected build, migration, reset or deploy is run locally.
- The initial direct lint of a root `.mjs` test encountered the shared typed ESLint configuration. The final test is TypeScript under the database package and participates in existing `pnpm test` / package lint; no shared lint exemption or CI workflow change was added.

## Evidence and remaining UNKNOWN

Record: operator/reviewer approvals, backup timestamp, live/baseline/release SHA, consumer inventory, sanitized env SET status, stop/drain evidence, read-only probe result, CI, effective build command, deployment ID, health/auth result, reopen times and incident/recovery decisions. Do not record secrets, raw errors, SQL text containing user data or personal data.

Still UNKNOWN: exhaustive external consumer inventory, live env scopes/overrides, newest backup, live state since last audit, approved downtime window, human secret custody, live Vercel build behavior/domain ordering and complete drain. Therefore this preparation is **NO-GO for execution** until filled and reviewed.

Sources: `apps/web/vercel.json`, `packages/database/prisma/schema.prisma`, `packages/database/scripts/assert-schema-ready.mjs`, `packages/database/src/runtime-database-url.ts`, baseline package build scripts; [Vercel env activation](https://vercel.com/docs/environment-variables/managing-environment-variables), [checked-in build precedence](https://vercel.com/docs/project-configuration/vercel-json#buildcommand), [Supabase Reset](https://supabase.com/docs/guides/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB).
