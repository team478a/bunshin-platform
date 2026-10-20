import { PrismaClient } from '@prisma/client/index';
import { describe, expect, it } from 'vitest';
import { PrismaOpsMorningDigestRunRepository } from '../src/ops-morning-digest-runs';
import {
  integrationDatabaseTarget,
  verifyIntegrationDatabase,
} from './integration-database-preflight';

export function registerOpsMorningDigestRunIntegrationCases() {
  describe('morning digest send ledger', () => {
    it('enforces a single daily claim, reclaims only after lease expiry, and checks status constraints', async () => {
      const target = integrationDatabaseTarget(process.env);
      const client = new PrismaClient({
        datasources: { db: { url: process.env['DATABASE_URL']! } },
      });
      const repository = new PrismaOpsMorningDigestRunRepository(client);
      const now = new Date('2026-10-19T22:30:00.000Z');
      const input = { environment: 'STAGING' as const, targetDate: '2026-10-19', now };
      let firstId: string | undefined;
      try {
        await verifyIntegrationDatabase(
          target,
          () => client.$queryRaw`
            SELECT datname AS database, shobj_description(oid, 'pg_database') AS marker
            FROM pg_database WHERE datname = current_database()
          `,
        );
        const initial = await repository.claim({ ...input, leaseMilliseconds: 1_000 });
        expect(initial).not.toBeNull();
        if (!initial) throw new Error('initial daily claim was not created');
        firstId = initial.id;
        const concurrent = await Promise.all([repository.claim(input), repository.claim(input)]);
        expect(concurrent).toEqual([null, null]);
        const row = await client.opsMorningDigestRun.findUniqueOrThrow({
          where: { id: initial.id },
        });
        expect(row.status).toBe('CLAIMED');
        expect(row.attemptCount).toBe(1);

        const reclaimed = await repository.claim({
          ...input,
          now: new Date(now.getTime() + 2_000),
        });
        expect(reclaimed).toMatchObject({ id: initial.id, attemptCount: 2 });
        expect(await repository.markSent({ claim: initial, sentAt: now })).toBe(false);
        expect(await repository.markSent({ claim: reclaimed!, sentAt: now })).toBe(true);
        expect(await repository.deliveryStatus(input)).toBe('SENT');

        await expect(
          client.$executeRaw`
            UPDATE "ops_morning_digest_runs" SET "status" = 'SENT', "sent_at" = NULL
            WHERE "id" = ${initial.id}::uuid
          `,
        ).rejects.toThrow();
        expect(await repository.claim(input)).toBeNull();
      } finally {
        if (firstId) await client.opsMorningDigestRun.deleteMany({ where: { id: firstId } });
        await client.$disconnect();
      }
    });

    it('identifies dates before the ledger starts as before-history, not missed deliveries', async () => {
      const target = integrationDatabaseTarget(process.env);
      const client = new PrismaClient({
        datasources: { db: { url: process.env['DATABASE_URL']! } },
      });
      const repository = new PrismaOpsMorningDigestRunRepository(client);
      const now = new Date('2026-10-20T22:30:00.000Z');
      let id: string | undefined;
      try {
        await verifyIntegrationDatabase(
          target,
          () => client.$queryRaw`
            SELECT datname AS database, shobj_description(oid, 'pg_database') AS marker
            FROM pg_database WHERE datname = current_database()
          `,
        );
        const run = await repository.claim({
          environment: 'STAGING',
          targetDate: '2026-10-20',
          now,
        });
        id = run?.id;
        expect(
          await repository.deliveryStatus({
            environment: 'STAGING',
            targetDate: '2026-10-19',
          }),
        ).toBe('BEFORE_HISTORY');
      } finally {
        if (id) await client.opsMorningDigestRun.deleteMany({ where: { id } });
        await client.$disconnect();
      }
    });
  });
}
