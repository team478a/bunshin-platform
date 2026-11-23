import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { runMigrationProcess } from './migration-process.mjs';
import { releaseCaPath } from './release-ca.mjs';
import { readReleasePrismaDiagnostic } from './release-prisma-command.mjs';
import {
  matchesExpectedProject,
  resolveMigrationBounds,
  resolveMigrationDirectUrl,
} from './deploy-migrations-for-vercel.mjs';
import {
  buildPsqlReleaseScript,
  loadReleaseMigrations,
  psqlArguments,
  psqlEnvironment,
} from './release-psql.mjs';

const requireModule = createRequire(import.meta.url);
const expectedProjectRef = 'vtkzinaudznwbsjoyszk';
const approvedGuidanceNames = [
  '20261120010000_fortune_personal_profile',
  '20261120020000_fortune_pending_consultation',
  '20261120030000_fortune_reading_reflection',
  '20261120040000_fortune_personal_home',
];
const approvedDeepReadingNames = [
  '20261121010000_fortune_reading_follow_ups',
  '20261121020000_fortune_experience_quality',
  '20261121030000_fortune_dynamic_intake',
  '20261121040000_fortune_structured_understanding',
  '20261121050000_fortune_deep_reading',
  '20261121060000_fortune_intake_quality',
];
const approvedMonetizationNames = [
  '20261122090000_fortune_commerce',
  '20261122100000_fortune_revenue',
  '20261122110000_fortune_experiments',
];
const approvedReferralRewardNames = [
  '20261122120000_referral_confirmation_reward',
  '20261122130000_fortune_follow_up_credits',
];
const releaseSettings = new Map([
  [
    'basic-profile',
    {
      approval: 'APPLY_FORTUNE_BASIC_PROFILE_SCHEMA_TO',
      approvedNames: ['20261123123000_fortune_basic_profile'],
    },
  ],
  [
    'card-catalog',
    {
      approval: 'APPLY_FORTUNE_CARD_CATALOG_SCHEMA_TO',
      approvedNames: ['20261123120000_fortune_knowledge_deck'],
    },
  ],
  [
    'referral-rewards',
    { approval: 'APPLY_FORTUNE_REFERRAL_SCHEMA_TO', approvedNames: approvedReferralRewardNames },
  ],
  [
    'monetization',
    { approval: 'APPLY_FORTUNE_MONETIZATION_SCHEMA_TO', approvedNames: approvedMonetizationNames },
  ],
  [
    'personal-guidance',
    { approval: 'APPLY_FORTUNE_GUIDANCE_SCHEMA_TO', approvedNames: approvedGuidanceNames },
  ],
  [
    'deep-reading',
    { approval: 'APPLY_FORTUNE_DEEP_READING_SCHEMA_TO', approvedNames: approvedDeepReadingNames },
  ],
]);

export async function runFortuneGuidanceRelease20261120Migration(
  execute = runMigrationProcess,
  environment = process.env,
) {
  if (environment.VERCEL_ENV !== 'production') {
    console.error('[database] RELEASE_MIGRATION_ENVIRONMENT_INVALID: production context required.');
    return 1;
  }
  const release = releaseSettings.get(environment.MIGRATION_APPLY_RELEASE ?? 'personal-guidance');
  if (
    !release ||
    environment.MIGRATION_APPLY_CONFIRMATION !== `${release.approval}_${expectedProjectRef}`
  ) {
    console.error('[database] RELEASE_MIGRATION_CONFIRMATION_INVALID: no migration started.');
    return 1;
  }
  let configurationDiagnostic = 'unclassified';
  let childEnvironment;
  let script;
  let bounds;
  let mode;
  try {
    configurationDiagnostic = 'mode-invalid';
    mode = environment.MIGRATION_APPLY_MODE ?? 'preview';
    if (!['preview', 'apply'].includes(mode)) throw new Error('INVALID_MODE');
    configurationDiagnostic = 'project-ref-invalid';
    if (environment.MIGRATION_APPLY_EXPECTED_PROJECT_REF !== expectedProjectRef)
      throw new Error('INVALID_PROJECT');
    configurationDiagnostic = 'connection-url-missing';
    if (!environment.DATABASE_URL || !environment.DIRECT_URL) throw new Error('MISSING_CONNECTION');
    configurationDiagnostic = 'connection-target-invalid';
    if (
      !matchesExpectedProject(environment.DATABASE_URL, expectedProjectRef) ||
      !matchesExpectedProject(environment.DIRECT_URL, expectedProjectRef)
    )
      throw new Error('INVALID_TARGET');
    const host = environment.SUPABASE_SESSION_POOLER_HOST;
    configurationDiagnostic = 'session-pooler-host-invalid';
    if (!host || !/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(host))
      throw new Error('INVALID_HOST');
    const session = new URL(resolveMigrationDirectUrl(environment.DIRECT_URL, host));
    configurationDiagnostic = 'session-pooler-target-invalid';
    if (
      session.hostname !== host ||
      session.port !== '5432' ||
      !matchesExpectedProject(session.toString(), expectedProjectRef) ||
      !session.password ||
      session.searchParams.has('options')
    )
      throw new Error('INVALID_SESSION');
    configurationDiagnostic = 'tls-mode-invalid';
    if (
      ![null, 'prefer', 'require', 'verify-ca', 'verify-full'].includes(
        session.searchParams.get('sslmode'),
      )
    )
      throw new Error('INVALID_TLS');
    if ([null, 'prefer'].includes(session.searchParams.get('sslmode')))
      session.searchParams.set('sslmode', 'require');
    configurationDiagnostic = 'release-ca-certificate-invalid';
    const caPath = releaseCaPath();
    session.searchParams.set('sslmode', 'verify-full');
    session.searchParams.set('sslrootcert', caPath);
    const resolver = new URL(session);
    resolver.search = '';
    resolver.searchParams.set('schema', 'public');
    resolver.searchParams.set('sslmode', 'require');
    resolver.searchParams.set('sslaccept', 'strict');
    resolver.searchParams.set('connect_timeout', '10');
    resolver.searchParams.set('socket_timeout', '60');
    resolver.searchParams.set('sslcert', caPath);
    configurationDiagnostic = 'migration-timeout-settings-invalid';
    bounds = resolveMigrationBounds(environment);
    configurationDiagnostic = 'release-source-invalid';
    const migrations = loadReleaseMigrations(new URL('../prisma/migrations/', import.meta.url));
    script = buildPsqlReleaseScript({
      migrations,
      approvedNames: release.approvedNames,
      bounds,
      mode,
      resolveExecutable: process.execPath,
      prismaCli: requireModule.resolve('prisma/build/index.js'),
      schemaPath: fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
    });
    childEnvironment = psqlEnvironment(session.toString(), {
      ...environment,
      DATABASE_URL: resolver.toString(),
      DIRECT_URL: resolver.toString(),
    });
  } catch {
    console.error(
      `[database] RELEASE_MIGRATION_CONFIGURATION_INVALID (${configurationDiagnostic}): values are not logged.`,
    );
    return 1;
  }
  const result = await execute('psql', psqlArguments, {
    cwd: new URL('../', import.meta.url),
    env: childEnvironment,
    input: script,
    captureOutput: true,
    timeoutMs: bounds.processTimeoutMs,
  });
  const marker =
    mode === 'preview'
      ? 'RELEASE_PSQL_PREVIEW_VERIFIED'
      : 'RELEASE_MIGRATIONS_APPLIED_AND_VERIFIED';
  if (
    result.reason !== 'EXITED' ||
    result.status !== 0 ||
    !result.capturedOutput?.split(/\r?\n/).includes(marker)
  ) {
    const detail = readReleasePrismaDiagnostic(result.capturedOutput ?? '');
    if (detail)
      console.error(
        `[database] RELEASE_PRISMA_FAILURE phase=${detail.phase}; reason=${detail.diagnostic}.`,
      );
    console.error(
      `[database] RELEASE_PSQL_FAILED_OR_UNCONFIRMED (${result.diagnostic ?? result.reason.toLowerCase()}): stop; inspect schema/history before retrying.`,
    );
    return 1;
  }
  console.log(
    `[database] ${marker}: target ${expectedProjectRef}; approved migration count ${release.approvedNames.length}; mode ${mode}.`,
  );
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.platform !== 'linux') {
    console.error(
      '[database] RELEASE_PSQL_LINUX_RUNNER_REQUIRED: use the approved GitHub workflow.',
    );
    process.exitCode = 1;
  } else process.exitCode = await runFortuneGuidanceRelease20261120Migration();
}
