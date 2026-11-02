import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  EXTERNAL_READ_VERSION,
  ExternalConnectionRead,
  type ExternalReadGrant,
  type ExternalReadPorts,
} from '@bunshin/application';
import {
  PrismaExternalReadRuntime,
  type ExternalReadAdmissionPolicy,
} from '../src/external-read-runtime';

const signal = () => new AbortController().signal;
function policy(): ExternalReadAdmissionPolicy {
  return {
    enabled: true,
    windowMs: 60_000,
    leaseMs: 10_000,
    client: { requests: 100, concurrent: 20 },
    connection: { requests: 100, concurrent: 20 },
    user: { requests: 100, concurrent: 20 },
  };
}
export function registerExternalReadRuntimeIntegrationCases(client: PrismaClient) {
  describe('external read runtime PostgreSQL admission and audit', () => {
    const peer = new PrismaClient();
    const workspaces: string[] = [],
      users: string[] = [],
      attempts: string[] = [],
      connections: string[] = [];
    afterAll(() => peer.$disconnect());
    afterEach(async () => {
      await client.externalReadAudit.deleteMany({
        where: { OR: [{ attemptId: { in: attempts } }, { connectionId: { in: connections } }] },
      });
      await client.externalReadGrant.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.bunshin.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await client.workspace.deleteMany({ where: { id: { in: workspaces } } });
      await client.user.deleteMany({ where: { id: { in: users } } });
      workspaces.length = 0;
      users.length = 0;
      attempts.length = 0;
      connections.length = 0;
    });
    async function grant(
      options: { userId?: string; clientId?: string; environment?: 'test' | 'development' } = {},
    ): Promise<ExternalReadGrant> {
      const userId =
        options.userId ??
        (await client.user.create({ data: { displayName: 'Synthetic read runtime' } })).id;
      if (!options.userId) users.push(userId);
      const workspace = await client.workspace.create({
        data: { name: 'Synthetic read runtime', type: 'ORGANIZATION' },
      });
      workspaces.push(workspace.id);
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Synthetic read runtime' },
      });
      const member = await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId,
          status: 'ACTIVE',
          consentedAt: new Date(),
        },
      });
      const bunshin = await client.bunshin.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          ownerUserId: userId,
          slug: randomUUID(),
          name: 'Synthetic',
          type: 'COPY',
          status: 'ACTIVE',
          objectiveSummary: 'Synthetic',
          audienceSummary: 'Synthetic',
          personalitySummary: 'Synthetic',
        },
      });
      const now = new Date();
      const result: ExternalReadGrant = {
        connectionId: randomUUID(),
        clientId: options.clientId ?? 'synthetic-runtime',
        environment: options.environment ?? 'test',
        revision: 1,
        scope: {
          workspaceId: workspace.id,
          serviceId: group.id,
          groupMembershipId: member.id,
          userId,
          bunshinId: bunshin.id,
        },
        operations: ['member-usage:read'],
        grantedAt: new Date(now.getTime() - 1000),
        expiresAt: new Date(now.getTime() + 3600_000),
        revokedAt: null,
      };
      connections.push(result.connectionId);
      await client.externalReadGrant.create({
        data: {
          id: result.connectionId,
          clientId: result.clientId,
          environment: result.environment,
          revision: 1,
          workspaceId: workspace.id,
          groupId: group.id,
          groupMembershipId: member.id,
          userId,
          bunshinId: bunshin.id,
          operations: [...result.operations],
          consentVersion: 'external-read-consent-v1',
          grantedAt: result.grantedAt,
          expiresAt: result.expiresAt,
        },
      });
      return result;
    }
    function runtime(p = policy(), db = client, environment: 'test' | 'development' = 'test') {
      return new PrismaExternalReadRuntime(db, environment, () => p);
    }
    function event(): Parameters<ExternalReadPorts['audit']['record']>[0] {
      const attemptId = randomUUID();
      attempts.push(attemptId);
      return {
        attemptId,
        version: EXTERNAL_READ_VERSION,
        requestId: 'same-request',
        connectionId: 'unresolved-connection',
        clientId: 'synthetic-runtime',
        environment: 'test',
        operation: 'member-usage:read',
        outcome: 'DENIED',
        count: 0,
      };
    }
    it.each([false, true])(
      'runs the Core with durable admission/audit and discards revoked data: %s',
      async (revoke) => {
        const g = await grant();
        const r = runtime();
        const reader = new ExternalConnectionRead(
          {
            admission: r,
            audit: r,
            authorization: { permitted: () => Promise.resolve(true) },
            grants: {
              find: async () => {
                const row = await client.externalReadGrant.findUnique({
                  where: { id: g.connectionId },
                });
                return row?.revokedAt === null ? g : null;
              },
            },
          },
          'member-usage:read',
          async () => {
            if (revoke)
              await client.externalReadGrant.update({
                where: { id: g.connectionId },
                data: { revokedAt: new Date() },
              });
            return { data: { safe: true }, count: 1 };
          },
        );
        const pending = reader.execute(
          { clientId: g.clientId, environment: g.environment },
          { connectionId: g.connectionId, requestId: 'caller-request' },
        );
        if (revoke) await expect(pending).rejects.toMatchObject({ code: 'DENIED' });
        else await expect(pending).resolves.toEqual({ safe: true });
        const receipts = await client.externalReadAudit.findMany({
          where: { connectionId: g.connectionId },
          orderBy: { occurredAt: 'asc' },
        });
        expect(receipts.map((row) => row.outcome)).toEqual(
          revoke ? ['READ_COMPLETED', 'DENIED'] : ['READ_COMPLETED'],
        );
        expect(new Set(receipts.map((row) => row.attemptId)).size).toBe(1);
        expect(
          await client.externalReadAdmission.count({
            where: { connectionId: g.connectionId, releasedAt: null },
          }),
        ).toBe(0);
      },
    );
    it.each(['client', 'connection', 'user'] as const)(
      'enforces %s concurrency across independent DB clients',
      async (axis) => {
        const first = await grant();
        const second =
          axis === 'connection'
            ? first
            : await grant({
                ...(axis === 'user'
                  ? { userId: first.scope.userId, clientId: 'other-client' }
                  : {}),
              });
        const p = policy();
        p[axis].concurrent = 1;
        const results = await Promise.all([
          runtime(p).reserve(first, signal()),
          runtime(p, peer).reserve(second, signal()),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await client.externalReadAdmission.count({ where: { userId: { in: users } } })).toBe(
          1,
        );
        await Promise.all(
          results.map(async (item) => {
            await item?.release(signal());
          }),
        );
      },
    );
    it.each(['client', 'connection', 'user'] as const)(
      'release does not refund the %s sliding-window rate',
      async (axis) => {
        const first = await grant();
        const second =
          axis === 'connection'
            ? first
            : await grant({
                ...(axis === 'user'
                  ? { userId: first.scope.userId, clientId: 'other-client' }
                  : {}),
              });
        const p = policy();
        p[axis].requests = 1;
        const r = runtime(p);
        const permit = await r.reserve(first, signal());
        expect(permit).not.toBeNull();
        await permit!.release(signal());
        expect(await runtime(p, peer).reserve(second, signal())).toBeNull();
      },
    );
    it('does not consume other axes on denial and serializes uppercase UUIDs identically', async () => {
      const first = await grant();
      const second = await grant({ userId: first.scope.userId, clientId: 'other-client' });
      const p = policy();
      p.user.requests = 2;
      p.connection.concurrent = 1;
      expect(await runtime(p).reserve(first, signal())).not.toBeNull();
      expect(
        await runtime(p, peer).reserve(
          {
            ...first,
            connectionId: first.connectionId.toUpperCase(),
            scope: { ...first.scope, userId: first.scope.userId.toUpperCase() },
          },
          signal(),
        ),
      ).toBeNull();
      expect(await runtime(p).reserve(second, signal())).not.toBeNull();
      expect(
        await client.externalReadAdmission.count({ where: { userId: first.scope.userId } }),
      ).toBe(2);
    });
    it('keeps active leases outside the rate window, recovers expired leases, and isolates late release', async () => {
      const g = await grant();
      const p = policy();
      p.windowMs = 1_000;
      p.connection.concurrent = 1;
      const r = runtime(p);
      const old = await r.reserve(g, signal());
      expect(old).not.toBeNull();
      await client.$executeRaw`UPDATE external_read_admissions SET admitted_at=clock_timestamp()-INTERVAL '2 seconds', expires_at=clock_timestamp()+INTERVAL '8 seconds' WHERE connection_id=${g.connectionId}::uuid`;
      expect(await r.reserve(g, signal())).toBeNull();
      await client.$executeRaw`UPDATE external_read_admissions SET admitted_at=clock_timestamp()-INTERVAL '11 seconds', expires_at=clock_timestamp()-INTERVAL '1 second' WHERE connection_id=${g.connectionId}::uuid`;
      const next = await r.reserve(g, signal());
      expect(next).not.toBeNull();
      await old!.release(signal());
      await old!.release(signal());
      expect(
        await client.externalReadAdmission.count({
          where: { connectionId: g.connectionId, releasedAt: null },
        }),
      ).toBe(1);
      expect(await r.reserve(g, signal())).toBeNull();
      await next!.release(signal());
    });
    it('expires rate history by elapsed time rather than calendar-day reset', async () => {
      const g = await grant();
      const p = policy();
      p.connection.requests = 1;
      const r = runtime(p);
      const permit = await r.reserve(g, signal());
      await permit!.release(signal());
      await client.$executeRaw`UPDATE external_read_admissions SET admitted_at=clock_timestamp()-INTERVAL '61 seconds', expires_at=clock_timestamp()-INTERVAL '51 seconds' WHERE connection_id=${g.connectionId}::uuid`;
      expect(await r.reserve(g, signal())).not.toBeNull();
    });
    it('separates environments while sharing user limits across workspaces/services/Bunshin', async () => {
      const first = await grant();
      const other = await grant({ userId: first.scope.userId, environment: 'development' });
      const p = policy();
      p.user.concurrent = 1;
      expect(await runtime(p).reserve(first, signal())).not.toBeNull();
      expect(await runtime(p, peer, 'development').reserve(other, signal())).not.toBeNull();
      await expect(runtime(p).reserve(other, signal())).rejects.toMatchObject({ code: 'DENIED' });
    });
    it.each(['revoked', 'expired', 'scope', 'revision'] as const)(
      'rejects %s before reservation',
      async (change) => {
        const g = await grant();
        if (change === 'revoked')
          await client.externalReadGrant.update({
            where: { id: g.connectionId },
            data: { revokedAt: new Date() },
          });
        if (change === 'expired')
          await client.externalReadGrant.update({
            where: { id: g.connectionId },
            data: {
              grantedAt: new Date(Date.now() - 10_000),
              expiresAt: new Date(Date.now() - 1_000),
            },
          });
        if (change === 'scope') g.scope.bunshinId = randomUUID();
        if (change === 'revision') g.revision++;
        await expect(runtime().reserve(g, signal())).rejects.toMatchObject({ code: 'DENIED' });
        expect(
          await client.externalReadAdmission.count({ where: { connectionId: g.connectionId } }),
        ).toBe(0);
      },
    );
    it('fails closed on absent, disabled, invalid policy and aborted requests', async () => {
      const g = await grant();
      expect(
        await new PrismaExternalReadRuntime(client, 'test', () => null).reserve(g, signal()),
      ).toBeNull();
      expect(await runtime({ ...policy(), enabled: false }).reserve(g, signal())).toBeNull();
      for (const p of [
        { ...policy(), leaseMs: 9_999 },
        { ...policy(), windowMs: 86_400_001 },
        { ...policy(), user: { requests: 0, concurrent: 1 } },
      ])
        await expect(runtime(p).reserve(g, signal())).rejects.toMatchObject({
          code: 'UNAVAILABLE',
        });
      const controller = new AbortController();
      controller.abort();
      await expect(runtime().reserve(g, controller.signal)).rejects.toMatchObject({
        code: 'TIMEOUT',
      });
      expect(
        await client.externalReadAdmission.count({ where: { connectionId: g.connectionId } }),
      ).toBe(0);
    });
    it('records unknown-grant denials without inventing an owner and deduplicates exact receipts', async () => {
      const e = event();
      const r = runtime();
      await Promise.all([r.record(e, signal()), runtime(policy(), peer).record(e, signal())]);
      const rows = await client.externalReadAudit.findMany({ where: { attemptId: e.attemptId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject(e);
      await expect(r.record({ ...e, count: 1 }, signal())).rejects.toMatchObject({
        code: 'UNAVAILABLE',
      });
      await expect(r.record({ ...e, requestId: 'changed' }, signal())).rejects.toMatchObject({
        code: 'UNAVAILABLE',
      });
      expect(await client.externalReadAudit.count({ where: { attemptId: e.attemptId } })).toBe(1);
    });
    it('preserves read receipt then denial for one attempt, and separates repeated caller request IDs', async () => {
      const e = event();
      const another = event();
      const r = runtime();
      await r.record({ ...e, outcome: 'READ_COMPLETED', count: 1 }, signal());
      await r.record(e, signal());
      await r.record(another, signal());
      expect(
        await client.externalReadAudit.count({
          where: { attemptId: { in: [e.attemptId, another.attemptId] } },
        }),
      ).toBe(3);
    });
    it('projects only allowed metadata and rejects malformed/foreign audit events', async () => {
      const e = event();
      const r = runtime();
      await r.record(
        { ...e, token: 'synthetic-do-not-store', payload: 'synthetic-do-not-store' } as typeof e,
        signal(),
      );
      expect(
        JSON.stringify(
          await client.externalReadAudit.findMany({ where: { attemptId: e.attemptId } }),
        ),
      ).not.toContain('synthetic-do-not-store');
      for (const patch of [
        { environment: 'production' },
        { attemptId: 'bad' },
        { connectionId: '../bad' },
        { operation: 'publish:write' },
        { count: 11 },
        { outcome: 'secret' },
      ])
        await expect(r.record({ ...e, ...patch } as typeof e, signal())).rejects.toMatchObject({
          code: 'UNAVAILABLE',
        });
    });
    it('rolls back a reservation when abort occurs after insert', async () => {
      const g = await grant();
      const controller = new AbortController();
      const broken = client.$extends({
        query: {
          externalReadAdmission: {
            async create({ args, query }) {
              const result = await query(args);
              controller.abort();
              return result;
            },
          },
        },
      });
      await expect(
        new PrismaExternalReadRuntime(broken as unknown as PrismaClient, 'test', policy).reserve(
          g,
          controller.signal,
        ),
      ).rejects.toMatchObject({ code: 'TIMEOUT' });
      expect(
        await client.externalReadAdmission.count({ where: { connectionId: g.connectionId } }),
      ).toBe(0);
    });
    it('propagates sanitized audit failure without persisting a partial receipt', async () => {
      const e = event();
      const broken = client.$extends({
        query: {
          externalReadAudit: {
            async createMany({ args, query }) {
              await query(args);
              throw new Error('private SQL error');
            },
          },
        },
      });
      await expect(
        new PrismaExternalReadRuntime(broken as unknown as PrismaClient, 'test', policy).record(
          e,
          signal(),
        ),
      ).rejects.toMatchObject({ code: 'UNAVAILABLE', message: 'external read unavailable' });
      expect(await client.externalReadAudit.count({ where: { attemptId: e.attemptId } })).toBe(0);
    });
    it('retains recent rate/receipts and prunes only old rows in this environment in bounded batches', async () => {
      const g = await grant();
      const r = runtime();
      await r.reserve(g, signal());
      await r.reserve(g, signal());
      await r.reserve(g, signal());
      const rows = await client.externalReadAdmission.findMany({
        where: { connectionId: g.connectionId },
        orderBy: { admittedAt: 'asc' },
      });
      for (const row of rows.slice(0, 2))
        await client.$executeRaw`UPDATE external_read_admissions SET admitted_at=clock_timestamp()-INTERVAL '3 days', expires_at=clock_timestamp()-INTERVAL '3 days'+INTERVAL '10 seconds' WHERE id=${row.id}::uuid`;
      const old = event(),
        foreign = event(),
        recent = event();
      await r.record(old, signal());
      await r.record(recent, signal());
      await runtime(policy(), peer, 'development').record(
        { ...foreign, environment: 'development' },
        signal(),
      );
      await client.externalReadAudit.updateMany({
        where: { attemptId: { in: [old.attemptId, foreign.attemptId] } },
        data: { occurredAt: new Date(Date.now() - 31 * 86_400_000) },
      });
      expect(await r.prune(signal(), 1)).toEqual({ admissions: 1, audits: 1 });
      expect(
        await client.externalReadAdmission.count({ where: { connectionId: g.connectionId } }),
      ).toBe(2);
      expect(
        await client.externalReadAudit.count({
          where: { attemptId: { in: [recent.attemptId, foreign.attemptId] } },
        }),
      ).toBe(2);
      await expect(r.prune(signal(), 1001)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });
    it('protects tables with RLS and composite grant ownership constraints', async () => {
      const g = await grant();
      await runtime().reserve(g, signal());
      const [row] = await client.externalReadAdmission.findMany({
        where: { connectionId: g.connectionId },
      });
      await expect(
        client.externalReadAdmission.update({
          where: { id: row!.id },
          data: { userId: randomUUID() },
        }),
      ).rejects.toThrow();
      const tables = await client.$queryRaw<
        { relname: string; relrowsecurity: boolean }[]
      >`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('external_read_admissions', 'external_read_audits')`;
      expect(tables).toHaveLength(2);
      expect(tables.every((t) => t.relrowsecurity)).toBe(true);
    });
  });
}
