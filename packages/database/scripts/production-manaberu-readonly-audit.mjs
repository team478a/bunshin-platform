import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  matchesExpectedProject,
  resolveMigrationDirectUrl,
  withMigrationConnectionMetadata,
} from './deploy-migrations-for-vercel.mjs';

const requireModule = createRequire(import.meta.url);

export const productionManaberuAuditQueries = Object.freeze({
  service: `
    SELECT
      sc.slug,
      sc.visibility::text AS visibility,
      srp.mode::text AS registration_mode,
      srp.email_enabled,
      srp.line_enabled,
      scm.status::text AS commercial_status,
      scm.billing_mode::text AS billing_mode,
      scm.included_member_limit,
      scm.monthly_ai_generation_limit
    FROM service_configurations sc
    LEFT JOIN service_registration_policies srp
      ON srp.workspace_id = sc.workspace_id AND srp.group_id = sc.group_id
    LEFT JOIN service_commercial_settings scm
      ON scm.workspace_id = sc.workspace_id AND scm.group_id = sc.group_id
    WHERE sc.slug = 'manaberu-style'`,
  programs: `
    SELECT
      sp.display_name,
      sp.status::text AS status,
      sp.settings->>'moduleKey' AS module_key,
      sp.settings->'personalLearningPilot'->>'enabled' AS pilot_enabled,
      sp.settings->'personalLearningPilot'->'participantControl' AS participant_control,
      jsonb_array_length(
        COALESCE(sp.settings->'personalLearningPilot'->'enrollmentIds', '[]'::jsonb)
      ) AS projected_enrollment_count,
      COUNT(DISTINCT po.id)::int AS offering_count,
      COUNT(DISTINCT pe.id)::int AS enrollment_count,
      COUNT(DISTINCT pls.id) FILTER (WHERE pls.revoked_at IS NULL)::int AS active_seat_count,
      COUNT(DISTINCT pls.id) FILTER (
        WHERE pls.kind = 'INTERNAL' AND pls.revoked_at IS NULL
      )::int AS internal_seat_count,
      COUNT(DISTINCT pls.id) FILTER (
        WHERE pls.kind = 'EXTERNAL' AND pls.revoked_at IS NULL
      )::int AS external_seat_count,
      COUNT(DISTINCT auc.id)::int AS consent_count
    FROM service_configurations sc
    JOIN service_programs sp
      ON sp.workspace_id = sc.workspace_id AND sp.group_id = sc.group_id
    LEFT JOIN program_offerings po
      ON po.workspace_id = sp.workspace_id
      AND po.group_id = sp.group_id
      AND po.service_program_id = sp.id
    LEFT JOIN program_enrollments pe
      ON pe.workspace_id = sp.workspace_id
      AND pe.group_id = sp.group_id
      AND pe.service_program_id = sp.id
    LEFT JOIN personal_learning_pilot_seats pls
      ON pls.workspace_id = sp.workspace_id
      AND pls.group_id = sp.group_id
      AND pls.service_program_id = sp.id
    LEFT JOIN ai_training_usage_consents auc
      ON auc.workspace_id = sp.workspace_id
      AND auc.group_id = sp.group_id
      AND auc.program_enrollment_id = pe.id
    WHERE sc.slug = 'manaberu-style'
    GROUP BY sp.id, sp.display_name, sp.status, sp.settings
    ORDER BY sp.created_at`,
  offerings: `
    SELECT
      sp.display_name AS program_name,
      po.version,
      po.status::text AS status,
      po.is_free,
      (po.price_reference IS NOT NULL) AS has_price_reference,
      po.api_cost_owner::text AS api_cost_owner,
      po.support_owner::text AS support_owner,
      po.terms_snapshot->>'participation' AS participation,
      po.terms_snapshot->'supportModes' AS support_modes,
      (po.starts_at IS NULL OR po.starts_at <= now())
        AND (po.ends_at IS NULL OR po.ends_at > now()) AS currently_available
    FROM service_configurations sc
    JOIN service_programs sp
      ON sp.workspace_id = sc.workspace_id AND sp.group_id = sc.group_id
    JOIN program_offerings po
      ON po.workspace_id = sp.workspace_id
      AND po.group_id = sp.group_id
      AND po.service_program_id = sp.id
    WHERE sc.slug = 'manaberu-style'
    ORDER BY sp.created_at, po.version`,
  participation: `
    WITH target AS (
      SELECT workspace_id, group_id
      FROM service_configurations
      WHERE slug = 'manaberu-style'
    ), members AS (
      SELECT gm.id
      FROM group_memberships gm
      JOIN target t ON t.workspace_id = gm.workspace_id AND t.group_id = gm.group_id
      WHERE gm.role = 'PARTICIPANT' AND gm.status = 'ACTIVE'
    )
    SELECT
      COUNT(DISTINCT m.id)::int AS active_participant_count,
      COUNT(DISTINCT m.id) FILTER (WHERE pe.id IS NULL)::int
        AS participant_without_active_enrollment_count,
      COUNT(DISTINCT pe.id)::int AS active_enrollment_count,
      COUNT(DISTINCT pe.id) FILTER (WHERE seat.id IS NULL)::int
        AS enrollment_without_internal_seat_count,
      COUNT(DISTINCT pe.id) FILTER (
        WHERE seat.id IS NOT NULL AND consent.id IS NULL
      )::int AS seated_without_consent_count
    FROM members m
    LEFT JOIN program_enrollments pe
      ON pe.group_membership_id = m.id AND pe.status = 'ACTIVE'
    LEFT JOIN personal_learning_pilot_seats seat
      ON seat.program_enrollment_id = pe.id
      AND seat.kind = 'INTERNAL'
      AND seat.cohort = 'INTERNAL'
      AND seat.revoked_at IS NULL
    LEFT JOIN ai_training_usage_consents consent
      ON consent.program_enrollment_id = pe.id`,
  provider: `
    SELECT
      environment::text AS environment,
      provider::text AS provider,
      version,
      status::text AS status,
      model,
      daily_budget_usd_micros,
      monthly_budget_usd_micros,
      request_cost_usd_micros,
      globally_paused,
      (encrypted_api_key IS NOT NULL) AS credential_configured,
      (last_verified_at IS NOT NULL) AS verified,
      last_error_category
    FROM ai_provider_configurations
    WHERE environment = 'PRODUCTION' AND status = 'ACTIVE'
    ORDER BY provider, version DESC`,
});

function safeJson(value) {
  return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
}

async function defaultConnect(connectionUrl) {
  process.env.DATABASE_URL = connectionUrl;
  process.env.DIRECT_URL = connectionUrl;
  const { PrismaClient } = requireModule('@prisma/client');
  return new PrismaClient();
}

export async function runProductionManaberuAudit(
  environment = process.env,
  connect = defaultConnect,
) {
  if (environment.VERCEL_ENV !== 'production') {
    console.error('[database] MANABERU_AUDIT_ENVIRONMENT_INVALID: production context required.');
    return 1;
  }
  const missing = ['DATABASE_URL', 'DIRECT_URL'].filter((name) => !environment[name]);
  if (missing.length > 0) {
    console.error(
      `[database] MANABERU_AUDIT_CONFIGURATION_INVALID: missing ${missing.join(', ')}.`,
    );
    return 1;
  }

  let connectionUrl;
  try {
    const projectRef = environment.MANABERU_AUDIT_EXPECTED_PROJECT_REF;
    if (
      !/^[a-z0-9]{20}$/.test(projectRef ?? '') ||
      !matchesExpectedProject(environment.DATABASE_URL, projectRef) ||
      !matchesExpectedProject(environment.DIRECT_URL, projectRef)
    )
      throw new Error('INVALID_TARGET');
    const sessionUrl = resolveMigrationDirectUrl(
      environment.DIRECT_URL,
      environment.SUPABASE_SESSION_POOLER_HOST,
    );
    const session = new URL(sessionUrl);
    if (
      !matchesExpectedProject(sessionUrl, projectRef) ||
      session.port !== '5432' ||
      !session.hostname.endsWith('.pooler.supabase.com')
    )
      throw new Error('INVALID_SESSION_TARGET');
    connectionUrl = withMigrationConnectionMetadata(sessionUrl, 'bunshin_manaberu_readonly_audit');
  } catch {
    console.error(
      '[database] MANABERU_AUDIT_CONFIGURATION_INVALID: target or connection settings rejected; values are not logged.',
    );
    return 1;
  }

  const client = await connect(connectionUrl);
  try {
    const result = await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
      await tx.$executeRawUnsafe("SET LOCAL idle_in_transaction_session_timeout = '15s'");
      const [service, programs, offerings, participation, provider] = await Promise.all([
        tx.$queryRawUnsafe(productionManaberuAuditQueries.service),
        tx.$queryRawUnsafe(productionManaberuAuditQueries.programs),
        tx.$queryRawUnsafe(productionManaberuAuditQueries.offerings),
        tx.$queryRawUnsafe(productionManaberuAuditQueries.participation),
        tx.$queryRawUnsafe(productionManaberuAuditQueries.provider),
      ]);
      return { service, programs, offerings, participation, provider };
    });
    console.log(`[database] MANABERU_PRODUCTION_AUDIT ${safeJson(result)}`);
    console.log('[database] MANABERU_PRODUCTION_AUDIT_COMPLETE: database changes=none.');
    return 0;
  } catch (error) {
    console.error(
      `[database] MANABERU_PRODUCTION_AUDIT_FAILED: ${error instanceof Error ? error.name : 'UNKNOWN'}; values and row identifiers are not logged.`,
    );
    return 1;
  } finally {
    await client.$disconnect();
  }
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) process.exitCode = await runProductionManaberuAudit();
