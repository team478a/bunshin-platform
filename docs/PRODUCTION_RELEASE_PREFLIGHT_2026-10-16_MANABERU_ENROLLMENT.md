# Production release preflight: Manaberu enrollment and consent

Date: 2026-10-16 (Asia/Tokyo). This preflight fixes the release candidate to `main` SHA `12194aa955edd4cfeebba22ebabb956e4be4196f` and Production SHA `85ff28be52e94cdda5ad93bd77820b3821cf3c65`.

## Scope and release path

- The release contains the three post-Production merges: #1315 (internal testers use normal invitation/enrollment flow), #1316 (explicit external-AI consent gate), and #1317 (OEM service access/approval policy).
- The exact `origin/production...origin/main` comparison is 45 files, 1,482 insertions, 46 deletions, including two additive Prisma migrations. No other main commits are included.
- The release branch starts at the fixed `main` SHA and merges the current `production` branch normally so the protected Production PR is up to date. Production-only migration/CI configuration is preserved; no direct push or force push is used.
- Vercel's Production branch is `production`. Main merge alone does not deploy.

## Database changes and compatibility

1. `20261016120000_ai_training_usage_consent` adds `ai_training_usage_consents`, scoped unique/FK constraints, one index, and RLS with no public policy. It does not backfill or modify existing rows.
2. `20261016150000_invitation_manual_service_registration` adds one PostgreSQL enum value. It does not rewrite existing registration settings.

Both migrations ran successfully in PR #1316/#1317 disposable PostgreSQL CI, followed by schema readiness and integration tests. The current Production deployment `7111272777` at SHA `85ff28be` was successful; at 2026-10-16 20:30 JST the public live endpoint returned `ok` and readiness returned `ready` with `databaseSchema: current`. This describes the existing deployment, not the new candidate.

The previous application understands existing registration modes. If the new invitation+manual-approval value is saved after release, rollback to the previous application may not render that mode; prefer a forward fix, or first restore a previous supported mode through the new application before any rollback. The consent table is additive; do not reverse its migration.

## CI and production history checks

- #1315: `verify` and `database` succeeded (run 38858292423).
- #1316: `verify` and `database` succeeded (run 38878090556).
- #1317: `verify` and `database` succeeded (run 38892568220).
- Read-only Production migration-history probe run 38894300305 was dispatched from `main` for the approved Supabase project reference. It is waiting for the GitHub `production` Environment approval. No Production database connection or mutation has occurred in this release turn yet.
- The release PR must independently pass required `verify` and `database` checks. The database job applies the migrations only to its disposable PostgreSQL service.

## Operational boundary

- No Production migration, configuration change, participant/Enrollment/Seat change, consent record, feature-flag change, Pilot START, AI Provider call, LINE message, or billing action has been performed in preparing this release.
- This is an application/schema release only. It does not authorize or perform the Wave 0 pilot start. Existing pilot, admission, notification, and Provider settings must remain as-is.
- Before merge, the operator must confirm the latest available backup and recovery procedure under the current Production context. The operator previously reported that a backup had been completed; its timestamp, scope, and restore evidence have not been independently verified here. Past restore completeness/RTO/RPO remain UNKNOWN.
- Vercel's normal Production build runs the bounded migration wrapper, schema-readiness gate, then Web build. Migration failure must stop the new deployment; do not manually run SQL or retry an uncertain migration.

## Stop / recovery

Stop if the Production history probe reports anything other than the two expected pending migrations (or none if already applied), if required CI fails, or if the latest-backup/recovery confirmation is unavailable. After deployment, confirm the Production deployment SHA/status and public live/ready endpoints before functional smoke tests. If a migration has completed, preserve it and use a forward fix; do not attempt a down migration or claim that an old Deployment is automatically safe after the new registration mode has been stored.
