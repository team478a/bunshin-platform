import { BuildServiceImprovementOverview } from '@bunshin/application';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaSocialSupportBehaviorAdapter } from '../src/social-support-behavior-adapter';
const anchor = new Date('2026-10-05T15:00:00Z');
const scope = {
  tenantRef: 'tenant',
  workspaceId: 'w',
  serviceId: 's',
  packageKey: 'SOCIAL',
  adapterKey: 'SOCIAL_SUPPORT_BEHAVIOR',
  environment: 'DEVELOPMENT' as const,
};
const input = {
  actorUserId: 'admin',
  scope,
  fromInclusive: anchor,
  toExclusive: new Date('2026-10-12T15:00:00Z'),
  limit: 100,
  subject: null,
};
const day = 86_400_000;
const at = (days: number) => new Date(anchor.getTime() + days * day);
function support(id = 'support', user = 'u', bunshin = 'b') {
  return {
    id,
    acceptedAt: anchor,
    offeredAt: at(-1),
    completedAt: null as Date | null,
    skippedAt: null as Date | null,
    updatedAt: anchor,
    barrierCase: {
      workspaceId: 'w',
      groupId: 's',
      userId: user,
      bunshinId: bunshin,
      bunshin: { id: bunshin, workspaceId: 'w', groupId: 's', ownerUserId: user },
    },
  };
}
function decision(days: number) {
  return {
    id: `d${days}`,
    workspaceId: 'w',
    bunshinId: 'b',
    decision: 'ACCEPTED',
    decidedAt: at(days),
    updatedAt: at(days),
  };
}
function post(days: number) {
  return {
    id: `p${days}`,
    workspaceId: 'w',
    bunshinId: 'b',
    actorUserId: 'u',
    postedAt: at(days),
    createdAt: at(days),
  };
}
function setup(rows = [support()]) {
  const tx = {
    $executeRaw: vi.fn(),
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'manager' }) },
    socialActivitySupportIntervention: { findMany: vi.fn().mockResolvedValue(rows) },
    missionDecision: { findMany: vi.fn().mockResolvedValue([]) },
    postRecord: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const client = {
    $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaClient;
  return {
    tx,
    client,
    adapter: new PrismaSocialSupportBehaviorAdapter(client, scope, () => at(14)),
  };
}
describe('fixed support behavior comparison', () => {
  it('uses paired half-open seven-day windows, deduplicated existence and scoped source queries', async () => {
    const s = setup();
    s.tx.missionDecision.findMany.mockResolvedValue([decision(-7), decision(0), decision(7)]);
    s.tx.postRecord.findMany.mockResolvedValue([post(-7), post(-1), post(7)]);
    const result = await s.adapter.readObservations(input);
    expect(result.observations[0]?.metadata).toEqual({
      beforeAccepted: true,
      afterAccepted: true,
      beforePosted: true,
      afterPosted: false,
      uncertain: false,
      pattern: 'P7',
    });
    expect(s.tx.socialActivitySupportIntervention.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          acceptedAt: { gte: input.fromInclusive, lt: input.toExclusive },
          barrierCase: { workspaceId: 'w', groupId: 's' },
        }),
      }),
    );
    expect(s.tx.postRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10001,
        where: expect.objectContaining({
          workspaceId: 'w',
          bunshinId: { in: ['b'] },
          bunshin: expect.objectContaining({ groupId: 's' }),
        }),
      }),
    );
  });
  it('withholds immature follow-up; does not remove it from denominator', async () => {
    const s = setup();
    const result = await new PrismaSocialSupportBehaviorAdapter(s.client, scope, () =>
      at(6),
    ).readObservations(input);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]?.metadata['uncertain']).toBe(true);
  });
  it('marks backdated reports and later rewritten decisions uncertain', async () => {
    const s = setup();
    s.tx.postRecord.findMany.mockResolvedValue([{ ...post(-1), createdAt: at(1) }]);
    s.tx.missionDecision.findMany.mockResolvedValue([{ ...decision(-1), updatedAt: at(1) }]);
    const result = await s.adapter.readObservations(input);
    expect(result.observations[0]?.metadata).toMatchObject({
      beforeAccepted: false,
      beforePosted: false,
      uncertain: true,
    });
  });
  it('rejects foreign service, owner and report actor, without leaking raw data', async () => {
    const s = setup();
    await expect(
      s.adapter.readObservations({ ...input, scope: { ...scope, serviceId: 'other' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(s.tx.groupMembership.findFirst).not.toHaveBeenCalled();
    s.tx.postRecord.findMany.mockResolvedValue([{ ...post(1), actorUserId: 'other' }]);
    await expect(s.adapter.readObservations(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    const bad = support();
    bad.barrierCase.bunshin.ownerUserId = 'other';
    await expect(setup([bad]).adapter.readObservations(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
  it('denies inactive managers before source reads and propagates failures', async () => {
    const s = setup();
    s.tx.groupMembership.findFirst.mockResolvedValue(null);
    await expect(s.adapter.readObservations(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(s.tx.socialActivitySupportIntervention.findMany).not.toHaveBeenCalled();
    const broken = setup();
    broken.tx.postRecord.findMany.mockRejectedValue(new Error('source down'));
    await expect(broken.adapter.readObservations(input)).rejects.toThrow('source down');
  });
  it('marks support and event limits incomplete, not zero', async () => {
    const s = setup([support('a'), support('b')]);
    const result = await s.adapter.readObservations({ ...input, limit: 1 });
    expect(result.coverage).toEqual({
      completeness: 'PARTIAL',
      truncated: true,
      missingCount: null,
    });
    s.tx.missionDecision.findMany.mockResolvedValue(
      Array.from({ length: 10001 }, () => decision(1)),
    );
    expect((await s.adapter.readObservations(input)).coverage.truncated).toBe(true);
  });
  it('preserves separate same-person supports and returns only allowlisted flags', async () => {
    const result = await setup([support('a'), support('b')]).adapter.readObservations(input);
    expect(result.observations).toHaveLength(2);
    expect(Object.keys(result.observations[0]!.metadata).sort()).toEqual([
      'afterAccepted',
      'afterPosted',
      'beforeAccepted',
      'beforePosted',
      'pattern',
      'uncertain',
    ]);
  });
  it('uses the same paired denominator and suppresses small joint patterns', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => support(`s${i}`, `u${i}`, `b${i}`));
    const s = setup(rows);
    const overview = () =>
      new BuildServiceImprovementOverview({ authorize: () => Promise.resolve(true) }, [
        {
          definition: s.adapter.definition,
          adapter: s.adapter,
          metrics: ['beforeAccepted', 'afterAccepted', 'beforePosted', 'afterPosted'].map(
            (key) => ({ key, flag: key }),
          ),
          uncertainFlags: ['uncertain'],
          privacyDimensions: ['pattern'],
        },
      ]).execute({
        actorUserId: input.actorUserId,
        scope: {
          tenantRef: scope.tenantRef,
          workspaceId: scope.workspaceId,
          serviceId: scope.serviceId,
          environment: scope.environment,
        },
        fromInclusive: input.fromInclusive,
        toExclusive: input.toExclusive,
        limit: input.limit,
      });
    expect((await overview()).sections[0]).toMatchObject({
      visibility: 'VISIBLE',
      denominator: { count: 10 },
      observedRecords: 10,
    });
    s.tx.postRecord.findMany.mockResolvedValue([
      { ...post(1), bunshinId: 'b0', actorUserId: 'u0' },
    ]);
    expect((await overview()).sections[0]).toMatchObject({
      visibility: 'WITHHELD',
      observedRecords: null,
      holdReasons: ['SMALL_SAMPLE'],
    });
  });
  it('does not query behavior when there are no starts', async () => {
    const s = setup([]);
    expect((await s.adapter.readObservations(input)).observations).toEqual([]);
    expect(s.tx.missionDecision.findMany).not.toHaveBeenCalled();
  });
});
