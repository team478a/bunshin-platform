import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  readMigrationManifest,
  verifyDeploymentDatabase,
  inspectDeploymentSnapshot,
} from '../scripts/deployment-database-gate.mjs';

/** Registered only after the existing disposable-database identity preflight. */
export function registerDeploymentDatabaseGateIntegrationCases(client: PrismaClient) {
  describe('read-only deployment verification on real PostgreSQL', () => {
    it('checks the entire migrated application and leaves history unchanged', async () => {
      const before = await client.$queryRawUnsafe(
        'SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY migration_name, id',
      );
      const manifest = await readMigrationManifest();
      expect((await verifyDeploymentDatabase(client, manifest)).migrations).toBe(manifest.length);
      expect(
        await client.$queryRawUnsafe(
          'SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY migration_name, id',
        ),
      ).toEqual(before);
    });
    it.each([
      ['valid', '', null],
      ['missing', 'DELETE FROM _prisma_migrations', 'history-missing'],
      ['failed', 'UPDATE _prisma_migrations SET finished_at = NULL', 'history-incomplete'],
      [
        'checksum',
        "UPDATE _prisma_migrations SET checksum = repeat('b',64)",
        'history-checksum-mismatch',
      ],
      [
        'unknown',
        "UPDATE _prisma_migrations SET migration_name = '20261023000001_unknown'",
        'history-unexpected',
      ],
      [
        'duplicate',
        'INSERT INTO _prisma_migrations SELECT * FROM _prisma_migrations',
        'history-duplicate',
      ],
      ['table', 'DROP TABLE gate_items', 'table-missing'],
      ['column', 'ALTER TABLE gate_items DROP COLUMN label', 'column-missing'],
      ['enum', 'DROP TYPE "GateState"', 'enum-missing'],
    ])('fails closed for %s; never repairs fixture history', async (_name, corruption, label) => {
      const schema = `deployment_gate_${randomUUID().replaceAll('-', '')}`;
      const url = new URL(process.env['DATABASE_URL']!);
      url.searchParams.set('schema', schema);
      const fixture = new PrismaClient({ datasources: { db: { url: url.toString() } } });
      const manifest = [{ name: '20261023000000_fixture', checksum: 'a'.repeat(64) }];
      const shape = {
        tables: [{ name: 'gate_items', columns: ['id', 'label'] }],
        enums: [{ name: 'GateState', value: 'READY' }],
      };
      await client.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      try {
        await fixture.$executeRawUnsafe(
          'CREATE TABLE _prisma_migrations (migration_name text, checksum text, finished_at timestamptz, rolled_back_at timestamptz)',
        );
        await fixture.$executeRawUnsafe(
          'INSERT INTO _prisma_migrations VALUES ($1,$2,now(),NULL)',
          manifest[0]!.name,
          manifest[0]!.checksum,
        );
        await fixture.$executeRawUnsafe('CREATE TABLE gate_items (id integer, label text)');
        await fixture.$executeRawUnsafe('CREATE TYPE "GateState" AS ENUM (\'READY\')');
        if (corruption) await fixture.$executeRawUnsafe(corruption);
        const before = await fixture.$queryRawUnsafe(
          'SELECT * FROM _prisma_migrations ORDER BY migration_name',
        );
        if (label)
          await expect(verifyDeploymentDatabase(fixture, manifest, shape)).rejects.toThrow(label);
        else
          expect(await verifyDeploymentDatabase(fixture, manifest, shape)).toMatchObject({
            migrations: 1,
            tables: 1,
            enums: 1,
          });
        expect(
          await fixture.$queryRawUnsafe('SELECT * FROM _prisma_migrations ORDER BY migration_name'),
        ).toEqual(before);
        // A real PostgreSQL read-only transaction refuses writes, including from this role.
        if (!label) {
          await expect(
            fixture.$transaction(async (tx) => {
              await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
              await inspectDeploymentSnapshot(tx, manifest, { tables: [], enums: [] });
              await tx.$executeRawUnsafe('DELETE FROM _prisma_migrations');
            }),
          ).rejects.toThrow(/read.only/i);
          expect(
            await fixture.$queryRawUnsafe(
              'SELECT * FROM _prisma_migrations ORDER BY migration_name',
            ),
          ).toEqual(before);
        }
      } finally {
        await fixture.$disconnect();
        await client.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      }
    });
  });
}
