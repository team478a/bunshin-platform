import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSocialRelease20261105Migration } from '../scripts/apply-social-release-20261105.mjs';
import type { runMigrationProcess } from '../scripts/migration-process.mjs';

const projectRef = 'vtkzinaudznwbsjoyszk';
const host = 'aws-0-ap-northeast-1.pooler.supabase.com';
const approvedNames = [
  '20261103030000_social_account_connections',
  '20261104010000_social_oauth_attempts',
  '20261104020000_social_publication_intents',
];
const environment = {
  VERCEL_ENV: 'production',
  MIGRATION_APPLY_EXPECTED_PROJECT_REF: projectRef,
  MIGRATION_APPLY_CONFIRMATION: `APPLY_SOCIAL_PUBLISHING_SCHEMA_TO_${projectRef}`,
  DATABASE_URL: `postgresql://postgres.${projectRef}:synthetic-secret@${host}:6543/postgres`,
  DIRECT_URL: `postgresql://postgres:synthetic-secret@db.${projectRef}.supabase.co:5432/postgres`,
  SUPABASE_SESSION_POOLER_HOST: host,
};

describe('approval-gated social publishing production migrations', () => {
  afterEach(() => vi.restoreAllMocks());

  it('defaults to preview and pins exactly the three approved migrations', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue({
      reason: 'EXITED',
      status: 0,
      capturedOutput: 'RELEASE_PSQL_PREVIEW_VERIFIED\n',
    });

    expect(await runSocialRelease20261105Migration(execute, environment)).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
    const [command, args, options] = execute.mock.calls[0]!;
    expect(command).toBe('psql');
    expect(args.join(' ')).not.toContain('synthetic-secret');
    expect(options.env.PGHOST).toBe(host);
    expect(options.env.PGPORT).toBe('5432');
    expect(options.env.PGPASSWORD).toBe('synthetic-secret');
    expect(options.env.PGSSLMODE).toBe('verify-full');
    for (const name of approvedNames) expect(options.input).toContain(name);
    expect(options.input).toContain(
      `pending <> ARRAY[${approvedNames.map((name) => `'${name}'`).join(',')}]::text[]`,
    );
    expect(options.input).not.toContain('migrate deploy');
  }, 15_000);

  it.each([
    { MIGRATION_APPLY_CONFIRMATION: 'wrong' },
    { MIGRATION_APPLY_EXPECTED_PROJECT_REF: 'wrong' },
    { MIGRATION_APPLY_MODE: 'invalid' },
    { DIRECT_URL: '' },
    { SUPABASE_SESSION_POOLER_HOST: 'wrong.example.com' },
  ])('fails closed before connecting for invalid configuration %j', async (overrides) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(await runSocialRelease20261105Migration(execute, { ...environment, ...overrides })).toBe(
      1,
    );
    expect(execute).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it('keeps the workflow on main behind production approval and exact confirmation', () => {
    const workflow = readFileSync(
      new URL(
        '../../../.github/workflows/apply-social-publishing-release-20261105.yml',
        import.meta.url,
      ),
      'utf8',
    );
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('APPLY_SOCIAL_PUBLISHING_SCHEMA_TO_vtkzinaudznwbsjoyszk');
    expect(workflow).toContain('db:migration:apply:social-release-20261105');
    expect(workflow).toContain('pnpm db:assert-ready');
  });
});
