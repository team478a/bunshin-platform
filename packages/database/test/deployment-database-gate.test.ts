import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  deploymentDatabaseUrl,
  gateFailureLabel,
  inspectDeploymentSnapshot,
  readMigrationManifest,
  requiredDatabaseShape,
  verifyDeploymentDatabase,
} from '../scripts/deployment-database-gate.mjs';
import { runSchemaReadiness } from '../scripts/assert-schema-ready.mjs';
import type { runMigrationProcess } from '../scripts/migration-process.mjs';

const manifest = [{ name: '20261023000000_fixture', checksum: 'a'.repeat(64) }];
const shape = {
  tables: [{ name: 'items', columns: ['id'] }],
  enums: [{ name: 'State', value: 'READY' }],
};
const row = {
  name: manifest[0]!.name,
  checksum: manifest[0]!.checksum,
  finished: true,
  rolled_back: false,
};
function transaction(history: unknown[] = [row]) {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi
      .fn()
      .mockResolvedValueOnce(history)
      .mockResolvedValueOnce([{ name: 'items' }])
      .mockResolvedValueOnce([{ name: 'items', column: 'id' }])
      .mockResolvedValueOnce([{ name: 'State', value: 'READY' }]),
  };
}
const asTx = (tx: ReturnType<typeof transaction>) => tx as unknown as Prisma.TransactionClient;

describe('read-only deployment database gate', () => {
  afterEach(() => vi.restoreAllMocks());
  it('hashes all actual SQL files and uses generated mapped database names', async () => {
    const actual = await readMigrationManifest();
    expect(actual.length).toBeGreaterThan(250);
    expect(actual.every((item) => /^[a-f0-9]{64}$/.test(item.checksum))).toBe(true);
    const required = requiredDatabaseShape();
    expect(required.tables).toContainEqual(expect.objectContaining({ name: 'users' }));
    expect(required.tables.find((table) => table.name === 'users')?.columns).toContain(
      'created_at',
    );
    expect(required.tables.flatMap((table) => table.columns)).not.toContain('workspace');
    expect(required.enums).toContainEqual({ name: 'UserStatus', value: 'ACTIVE' });
  });
  it.each([
    [[], 'history-missing'],
    [[{ ...row, name: '20261023000001_unknown' }], 'history-unexpected'],
    [[{ ...row, checksum: 'b'.repeat(64) }], 'history-checksum-mismatch'],
    [[{ ...row, finished: false }], 'history-incomplete'],
    [[row, row], 'history-duplicate'],
    [[{ ...row, rolled_back: true }], 'history-missing'],
  ])('rejects bad history without repair: %j', async (history, label) => {
    const tx = transaction(history);
    await expect(inspectDeploymentSnapshot(asTx(tx), manifest, shape)).rejects.toThrow(label);
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
  it('allows a matching rolled-back attempt only with one completed retry', async () => {
    await expect(
      inspectDeploymentSnapshot(
        asTx(transaction([{ ...row, finished: false, rolled_back: true }, row])),
        manifest,
        shape,
      ),
    ).resolves.toMatchObject({ migrations: 1 });
  });
  it.each(['table-missing', 'column-missing', 'enum-missing'])(
    'rejects %s even with valid history',
    async (label) => {
      const tx = transaction();
      const required = structuredClone(shape);
      if (label === 'table-missing') required.tables[0]!.name = 'absent';
      if (label === 'column-missing') required.tables[0]!.columns = ['absent'];
      if (label === 'enum-missing') required.enums[0]!.value = 'ABSENT';
      await expect(inspectDeploymentSnapshot(asTx(tx), manifest, required)).rejects.toThrow(label);
    },
  );
  it('establishes read-only and bounded repeatable snapshot before any catalog read', async () => {
    const tx = transaction();
    const callback = vi.fn(async (work: (value: unknown) => Promise<unknown>) => work(tx));
    await verifyDeploymentDatabase(
      { $transaction: callback } as unknown as PrismaClient,
      manifest,
      shape,
    );
    expect(tx.$executeRawUnsafe.mock.calls.map(([sql]) => String(sql))).toEqual([
      'SET TRANSACTION READ ONLY',
      "SET LOCAL lock_timeout = '1s'",
      "SET LOCAL statement_timeout = '10s'",
      "SET LOCAL idle_in_transaction_session_timeout = '15s'",
    ]);
    expect(callback.mock.calls[0]?.length).toBe(2);
    expect(tx.$executeRawUnsafe.mock.invocationCallOrder.at(-1)).toBeLessThan(
      tx.$queryRawUnsafe.mock.invocationCallOrder[0]!,
    );
    expect(tx.$queryRawUnsafe.mock.calls.every(([sql]) => String(sql).startsWith('SELECT'))).toBe(
      true,
    );
  });
  it.each(['5432', '6543'])(
    'uses the existing runtime path and strict pinned CA from pooler %s',
    (port) => {
      const url = new URL(
        deploymentDatabaseUrl(
          `postgresql://postgres.fixture:synthetic-secret@aws-0-ap-northeast-1.pooler.supabase.com:${port}/postgres`,
        ),
      );
      expect(url.port).toBe('6543');
      expect(url.searchParams.get('pgbouncer')).toBe('true');
      expect(url.searchParams.get('sslaccept')).toBe('strict');
      expect(url.searchParams.get('sslcert')).toMatch(/supabase-prod-ca-2021\.crt$/);
      expect(url.searchParams.get('socket_timeout')).toBe('15');
      expect(url.password).toBe('synthetic-secret');
    },
  );
  it.each([
    '',
    'https://host/path',
    'postgresql://test:test@localhost/db?schema=other',
    'postgresql://test:test@localhost/db?host=evil',
    'postgresql://test:test@aws-0-ap-northeast-1.pooler.supabase.com:6543/db?sslmode=disable',
    'postgresql://test:test@aws-0-ap-northeast-1.pooler.supabase.com:5432/db?sslaccept=accept_invalid_certs',
  ])('rejects unsafe configuration before connecting: %s', (source) =>
    expect(() => deploymentDatabaseUrl(source)).toThrow('configuration-invalid'),
  );
  it('redacts arbitrary exception messages', () => {
    expect(gateFailureLabel(new Error('postgresql://secret@host/db SQL private'))).toBe(
      'database-check-failed',
    );
    expect(gateFailureLabel(new Error('history-missing'))).toBe('history-missing');
  });
  it('Vercel build has no migration command; CI explicitly initializes only its disposable DB', () => {
    const config = JSON.parse(
      readFileSync(new URL('../../../apps/web/vercel.json', import.meta.url), 'utf8'),
    );
    expect([
      'cd ../.. && pnpm db:assert-ready && pnpm turbo run build --filter=web',
      'cd ../.. && pnpm db:assert-ready && pnpm turbo run build --filter=web --force',
    ]).toContain(config.buildCommand);
    const ci = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(ci).toContain('- run: pnpm db:migrate:deploy');
    expect(ci).not.toContain('- run: pnpm db:migrate:vercel');
  });
  it.each([
    {
      reason: 'EXITED',
      status: 1,
      capturedOutput: 'postgresql://synthetic-secret@host/db private SQL',
    },
    { reason: 'DEADLINE_EXCEEDED', status: 1 },
    { reason: 'EXITED', status: 0, capturedOutput: 'not the marker' },
    { reason: 'START_FAILED', status: 1 },
  ] as const)('worker failure stops with fixed diagnostic and no retry: %j', async (result) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue(result);
    expect(
      await runSchemaReadiness(
        { VERCEL_ENV: 'production', DATABASE_URL: 'not logged', PGOPTIONS: 'unsafe' },
        execute,
      ),
    ).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    const [, args, options] = execute.mock.calls[0]!;
    expect(args).toHaveLength(1);
    expect(args[0]).toMatch(/deployment-database-worker\.mjs$/);
    expect(options.timeoutMs).toBe(60000);
    expect(options.env.PGOPTIONS).toBeUndefined();
    expect(error.mock.calls.flat().join(' ')).not.toMatch(
      /synthetic-secret|postgresql:|private SQL/,
    );
  });
  it('accepts only marker plus exit zero and distinguishes preview skip', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi.fn<typeof runMigrationProcess>().mockResolvedValue({
      reason: 'EXITED',
      status: 0,
      capturedOutput: 'Database schema readiness gate passed.\n',
    });
    expect(await runSchemaReadiness({ VERCEL_ENV: 'production' }, execute)).toBe(0);
    expect(await runSchemaReadiness({ VERCEL_ENV: 'preview' }, execute)).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
