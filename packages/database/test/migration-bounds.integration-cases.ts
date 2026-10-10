import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { withMigrationConnectionMetadata } from '../scripts/deploy-migrations-for-vercel.mjs';
import { runMigrationProcess } from '../scripts/migration-process.mjs';

const requireModule = createRequire(import.meta.url);

/** Only called inside the integration suite after its live disposable DB preflight. */
export function registerMigrationBoundsIntegrationCases(client: PrismaClient) {
  const executeProbe = (sql: string) =>
    new Promise<{ status: number; lockTimeout: boolean; statementTimeout: boolean }>((resolve) => {
      const directUrl = withMigrationConnectionMetadata(process.env['DIRECT_URL']!);
      const child = spawn(
        process.execPath,
        [
          requireModule.resolve('prisma/build/index.js'),
          'db',
          'execute',
          '--stdin',
          '--schema',
          'prisma/schema.prisma',
        ],
        {
          cwd: new URL('../', import.meta.url),
          env: { ...process.env, DATABASE_URL: directUrl, DIRECT_URL: directUrl },
          stdio: ['pipe', 'ignore', 'pipe'],
        },
      );
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        // Do not emit raw SQL/connection errors into test output.
        stderr = (stderr + chunk.toString()).slice(-8192);
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
      child.once('error', () => {
        clearTimeout(timer);
        resolve({ status: 1, lockTimeout: false, statementTimeout: false });
      });
      child.once('close', (status) => {
        clearTimeout(timer);
        resolve({
          status: status ?? 1,
          lockTimeout: /lock timeout/i.test(stderr),
          statementTimeout: /statement timeout/i.test(stderr),
        });
      });
      child.stdin.on('error', () => {});
      child.stdin.end(sql);
    });

  describe('actual Prisma schema engine transaction-local bounds', () => {
    it('preserves an earlier migration, stops on SQL timeout, and does not resolve/retry failures', async () => {
      // A new synthetic schema inside the already verified disposable database only.
      const schema = `migration_bounds_${randomUUID().replaceAll('-', '')}`;
      await client.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      try {
        const url = new URL(process.env['DIRECT_URL']!);
        url.searchParams.set('schema', schema);
        const boundedUrl = withMigrationConnectionMetadata(url.toString());
        const result = await runMigrationProcess(
          process.execPath,
          [
            requireModule.resolve('prisma/build/index.js'),
            'migrate',
            'deploy',
            '--schema',
            fileURLToPath(new URL('./fixtures/migration-bounds/schema.prisma', import.meta.url)),
          ],
          {
            cwd: new URL('../', import.meta.url),
            env: { ...process.env, DATABASE_URL: boundedUrl, DIRECT_URL: boundedUrl },
            timeoutMs: 20000,
          },
        );
        expect(result.reason).toBe('EXITED');
        expect(result.status).not.toBe(0);
        const history = await client.$queryRawUnsafe<
          { migration_name: string; finished: boolean }[]
        >(
          `SELECT migration_name, finished_at IS NOT NULL AS finished FROM "${schema}"._prisma_migrations ORDER BY migration_name`,
        );
        expect(history).toEqual([
          { migration_name: '20261008000100_synthetic_first', finished: true },
          { migration_name: '20261008000200_synthetic_timeout', finished: false },
        ]);
        const tables = await client.$queryRaw<{ first_exists: boolean; later_exists: boolean }[]>`
          SELECT to_regclass(${schema + '.synthetic_first'}) IS NOT NULL AS first_exists,
                 to_regclass(${schema + '.synthetic_after_timeout'}) IS NOT NULL AS later_exists
        `;
        expect(tables).toEqual([{ first_exists: true, later_exists: false }]);
      } finally {
        // Synthetic schema only; does not delete any application table/history.
        await client.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      }
    }, 30000);

    it('applies committed settings inside the SQL transaction', async () => {
      const result = await executeProbe(`
        BEGIN;
        SET LOCAL lock_timeout = '100ms';
        SET LOCAL statement_timeout = '1s';
        SET LOCAL idle_in_transaction_session_timeout = '1s';
        DO $$ BEGIN
          IF current_setting('lock_timeout')::interval <> interval '100 milliseconds'
             OR current_setting('statement_timeout')::interval <> interval '1 second'
             OR current_setting('idle_in_transaction_session_timeout')::interval <> interval '1 second'
             OR current_setting('application_name') <> 'bunshin_migration_bounded'
          THEN RAISE EXCEPTION 'synthetic migration settings mismatch'; END IF;
        END $$;
        ROLLBACK;
      `);
      expect(result.status).toBe(0);
    }, 30000);

    it('aborts a slow statement in the actual schema engine', async () => {
      const result = await executeProbe(
        "BEGIN; SET LOCAL statement_timeout = '1s'; SELECT pg_sleep(2); COMMIT;",
      );
      expect(result.status).not.toBe(0);
      expect(result.statementTimeout).toBe(true);
    }, 30000);

    it('aborts a lock wait without changing tables or killing the holder', async () => {
      let release!: () => void;
      let acquired!: () => void;
      const ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const transaction = client.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('LOCK TABLE public.workspaces IN ACCESS SHARE MODE');
          acquired();
          await held;
        },
        { timeout: 30000 },
      );
      // Propagate holder failure instead of waiting forever for its ready signal.
      await Promise.race([
        ready,
        transaction.then(() => {
          throw new Error('Holder not acquired');
        }),
      ]);
      try {
        const result = await executeProbe(
          "BEGIN; SET LOCAL lock_timeout = '100ms'; LOCK TABLE public.workspaces IN ACCESS EXCLUSIVE MODE; ROLLBACK;",
        );
        expect(result.status).not.toBe(0);
        expect(result.lockTimeout).toBe(true);
      } finally {
        release();
        await transaction;
      }
      expect(await client.$queryRaw`SELECT 1 AS ready`).toEqual([{ ready: 1 }]);
    }, 40000);
  });
}
