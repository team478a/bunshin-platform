import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runRelease20261026Migration } from '../scripts/apply-release-20261026.mjs';
import type { runMigrationProcess } from '../scripts/migration-process.mjs';

const projectRef = 'vtkzinaudznwbsjoyszk';
const host = 'aws-0-ap-northeast-1.pooler.supabase.com';
const environment = {
  VERCEL_ENV: 'production',
  MIGRATION_APPLY_EXPECTED_PROJECT_REF: projectRef,
  MIGRATION_APPLY_CONFIRMATION: `APPLY_RELEASE_20261026_SERVICE_IDENTITY_TO_${projectRef}`,
  DATABASE_URL: `postgresql://postgres.${projectRef}:synthetic-secret@${host}:6543/postgres`,
  DIRECT_URL: `postgresql://postgres:synthetic-secret@db.${projectRef}.supabase.co:5432/postgres`,
  SUPABASE_SESSION_POOLER_HOST: host,
};

describe('approval-gated service identity production migrations', () => {
  afterEach(() => vi.restoreAllMocks());

  it('defaults to preview and pins the approved identity migrations to the validated target', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue({
      reason: 'EXITED',
      status: 0,
      capturedOutput: 'RELEASE_PSQL_PREVIEW_VERIFIED\n',
    });

    expect(await runRelease20261026Migration(execute, environment)).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
    const [command, args, options] = execute.mock.calls[0]!;
    expect(command).toBe('psql');
    expect(args.join(' ')).not.toContain('synthetic-secret');
    expect(options.env.PGHOST).toBe(host);
    expect(options.env.PGPORT).toBe('5432');
    expect(options.env.PGPASSWORD).toBe('synthetic-secret');
    expect(options.env.PGSSLMODE).toBe('verify-full');
    expect(options.input).toContain('20261025130000_repair_official_service_identity');
    expect(options.input).toContain('20261025131000_align_manaberu_public_registration_copy');
    expect(options.input).not.toContain('migrate resolve');
  });

  it.each([
    { MIGRATION_APPLY_CONFIRMATION: 'wrong' },
    { MIGRATION_APPLY_EXPECTED_PROJECT_REF: 'wrong' },
    { MIGRATION_APPLY_MODE: 'invalid' },
    { DIRECT_URL: '' },
    { SUPABASE_SESSION_POOLER_HOST: 'wrong.example.com' },
  ])('fails closed before connecting for invalid configuration %j', async (overrides) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>();
    expect(await runRelease20261026Migration(execute, { ...environment, ...overrides })).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('synthetic-secret');
  });

  it('requires the final verification marker and keeps the workflow approval gate', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/apply-production-release-20261026.yml', import.meta.url),
      'utf8',
    );
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('APPLY_RELEASE_20261026_SERVICE_IDENTITY_TO_vtkzinaudznwbsjoyszk');
    expect(workflow).toContain('db:migration:apply:release-20261026');
    expect(workflow).not.toContain('apply-release-20261020');
  });
});
