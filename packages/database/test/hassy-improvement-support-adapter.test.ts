import type { Prisma, PrismaClient } from '@prisma/client';
import type { ImprovementReadRequest } from '@bunshin/application';
import { describe, expect, it, vi } from 'vitest';
import { PrismaHassySupportImprovementAdapter } from '../src/hassy-improvement-support-adapter';

const scope = {
  tenantRef: 'tenant-a',
  workspaceId: 'workspace-a',
  serviceId: 'hassy-a',
  packageKey: 'SOCIAL',
  adapterKey: 'HASSY_SUPPORT_OUTCOMES',
  environment: 'DEVELOPMENT' as const,
};
const input: ImprovementReadRequest = {
  actorUserId: 'admin-a',
  scope,
  fromInclusive: new Date('2026-09-01Z'),
  toExclusive: new Date('2026-10-01Z'),
  limit: 100,
  subject: null,
};
const goal = (value = 'INQUIRY') => ({
  selection: { mode: 'GOAL_SPECIFIC', eligibleGoal: value, fallbackReason: null },
  title: 'private title',
  steps: ['private text'],
});
function row(id = 'support-a') {
  return {
    id,
    status: 'COMPLETED',
    definitionSnapshot: goal() as Prisma.JsonValue,
    offeredAt: new Date('2026-09-02Z'),
    acceptedAt: null as Date | null,
    completedAt: new Date('2026-09-04Z') as Date | null,
    skippedAt: null as Date | null,
    updatedAt: new Date('2026-09-04Z'),
    firstDisplayedAt: null as Date | null,
    firstDetailsViewedAt: null as Date | null,
    barrierCase: {
      id: 'case-a',
      workspaceId: scope.workspaceId,
      groupId: scope.serviceId,
      userId: 'user-a',
      bunshinId: 'bunshin-a',
      bunshin: {
        id: 'bunshin-a',
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        ownerUserId: 'user-a',
      },
    },
  };
}
function setup(rows = [row()], allowed = true) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const manager = vi.fn().mockResolvedValue(allowed ? { id: 'admin-membership' } : null);
  const tx = {
    $executeRaw: vi.fn(),
    groupMembership: { findFirst: manager },
    socialActivitySupportIntervention: { findMany },
  };
  const transaction = vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  const client = { $transaction: transaction } as unknown as PrismaClient;
  return {
    exposure: new PrismaHassySupportImprovementAdapter(client, {
      ...scope,
      adapterKey: 'SOCIAL_SUPPORT_EXPOSURE',
    }),
    adapter: new PrismaHassySupportImprovementAdapter(client, scope),
    findMany,
    manager,
    transaction,
  };
}

describe('Hassy support improvement read adapter', () => {
  it('rejects a Bunshin owned by another user even with no subject filter', async () => {
    const value = row();
    value.barrierCase.bunshin.ownerUserId = 'other-user';
    await expect(setup([value]).adapter.summarize(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
  it('holds a rate when completed and skipped timestamps conflict', async () => {
    const value = row();
    value.skippedAt = new Date('2026-09-05Z');
    const result = await setup([value]).adapter.summarize(input);
    expect(result.buckets[0]).toMatchObject({ timestampMissing: 1, completionRate: null });
  });
  it('reads a scoped offered cohort and keeps offered-time goal; completion is not inferred acceptance', async () => {
    const { adapter, findMany, manager } = setup();
    const result = await adapter.summarize(input);
    expect(result.buckets[0]).toMatchObject({
      goalBucket: 'INQUIRY',
      offered: 1,
      accepted: 0,
      completed: 1,
      skipped: 0,
      completionRate: 1,
    });
    expect(result.buckets[0]?.metric.cost).toEqual({
      estimatedUsdMicros: null,
      confirmedUsdMicros: null,
      unresolvedCount: null,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          supportKey: {
            notIn: ['IMAGE_CREDIT_REVIEW', 'MULTI_PLATFORM_PREPARATION', 'REFERRAL_BENEFIT_REVIEW'],
          },
          offeredAt: { gte: input.fromInclusive, lt: input.toExclusive },
          barrierCase: { workspaceId: scope.workspaceId, groupId: scope.serviceId },
        },
        take: 101,
        orderBy: [{ offeredAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(manager).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'admin-a',
          serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
          status: 'ACTIVE',
          groupId: scope.serviceId,
        }),
      }),
    );
    const observations = await adapter.readObservations(input);
    expect(JSON.stringify(observations)).not.toContain('private');
    expect(JSON.stringify(findMany.mock.calls)).not.toContain('currentGoal');
  });
  it('denies a non-manager before reading support records', async () => {
    const { adapter, findMany } = setup([], false);
    await expect(adapter.summarize(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(findMany).not.toHaveBeenCalled();
  });
  it.each([
    'tenantRef',
    'workspaceId',
    'serviceId',
    'packageKey',
    'adapterKey',
    'environment',
  ] as const)('rejects another configured %s before DB access', async (key) => {
    const { adapter, transaction } = setup();
    const altered = {
      ...input,
      scope: { ...scope, [key]: key === 'environment' ? 'STAGING' : 'other' },
    } as ImprovementReadRequest;
    await expect(adapter.readObservations(altered)).rejects.toBeDefined();
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each(['workspaceId', 'groupId', 'userId', 'bunshinId'] as const)(
    'rejects returned foreign %s',
    async (key) => {
      const value = row();
      value.barrierCase[key] = 'foreign';
      const { adapter } = setup([value]);
      await expect(
        adapter.summarize({ ...input, subject: { userRef: 'user-a', bunshinRef: 'bunshin-a' } }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    },
  );
  it('passes explicit subject restrictions into the real query', async () => {
    const { adapter, findMany } = setup();
    await adapter.summarize({ ...input, subject: { userRef: 'user-a', bunshinRef: 'bunshin-a' } });
    expect(findMany.mock.calls[0]?.[0].where.barrierCase).toEqual({
      workspaceId: scope.workspaceId,
      groupId: scope.serviceId,
      userId: 'user-a',
      bunshinId: 'bunshin-a',
    });
  });
  it('preserves historical members in cohort instead of filtering to ACTIVE participants', async () => {
    const { adapter, findMany } = setup();
    await adapter.summarize(input);
    expect(findMany.mock.calls[0]?.[0].where.barrierCase).not.toHaveProperty('groupMembership');
  });
  it('marks lookahead truncation partial and suppresses rates, not a complete denominator', async () => {
    const { adapter } = setup([row('a'), row('b')]);
    const result = await adapter.summarize({ ...input, limit: 1 });
    expect(result.coverage).toEqual({
      completeness: 'PARTIAL',
      missingCount: null,
      truncated: true,
    });
    expect(result.buckets[0]).toMatchObject({ offered: 1, completionRate: null });
  });
  it('uses real transition times before exclusive cutoff, not the latest status alone', async () => {
    const value = row();
    value.completedAt = new Date('2026-10-01Z');
    value.acceptedAt = new Date('2026-09-03Z');
    const { adapter } = setup([value]);
    const result = await adapter.summarize(input);
    expect(result.buckets[0]).toMatchObject({ accepted: 1, completed: 0, completionRate: 0 });
  });
  it.each([null, new Date('2026-09-01Z')])(
    'suppresses rate for missing or pre-offer completion timestamp %s',
    async (completedAt) => {
      const value = row();
      value.completedAt = completedAt;
      const { adapter } = setup([value]);
      const result = await adapter.summarize(input);
      expect(result.buckets[0]).toMatchObject({
        timestampMissing: 1,
        completionRate: null,
        metric: { coverage: { completeness: 'PARTIAL', missingCount: 1 } },
      });
    },
  );
  it('keeps legacy, mixed, unattributed, common and invalid snapshots separate', async () => {
    const snapshots = [
      { title: 'legacy' },
      { selection: { mode: 'COMMON', eligibleGoal: null, fallbackReason: 'MIXED_GOALS' } },
      {
        selection: {
          mode: 'COMMON',
          eligibleGoal: null,
          fallbackReason: 'ATTRIBUTION_UNAVAILABLE',
        },
      },
      {
        selection: {
          mode: 'COMMON',
          eligibleGoal: 'SALES',
          fallbackReason: 'GOAL_SPECIFIC_SUPPORT_NOT_CONFIGURED',
        },
      },
      {
        selection: { mode: 'GOAL_SPECIFIC', eligibleGoal: 'private-secret', fallbackReason: null },
      },
    ];
    const rows = snapshots.map((snapshot, i) => ({
      ...row(`support-${i}`),
      definitionSnapshot: snapshot,
    }));
    const { adapter } = setup(rows);
    const result = await adapter.summarize(input);
    expect(result.buckets.map((bucket) => bucket.goalBucket)).toEqual([
      'COMMON',
      'INVALID',
      'LEGACY',
      'MIXED',
      'UNATTRIBUTED',
    ]);
    expect(JSON.stringify(result)).not.toContain('private-secret');
  });
  it('excludes out-of-period records even if a faulty source returns them', async () => {
    const value = row();
    value.offeredAt = input.toExclusive;
    await expect(setup([value]).adapter.summarize(input)).rejects.toBeDefined();
  });
  it('returns an explicit empty complete cohort with no fabricated zero rate', async () => {
    expect(await setup([]).adapter.summarize(input)).toEqual({
      coverage: { completeness: 'COMPLETE', missingCount: 0, truncated: false },
      buckets: [],
    });
  });
  it('rejects invalid bounds before DB access', async () => {
    const { adapter, transaction } = setup();
    await expect(adapter.readObservations({ ...input, limit: 0 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('support exposure observations', () => {
  const request = { ...input, scope: { ...scope, adapterKey: 'SOCIAL_SUPPORT_EXPOSURE' } };
  it('shares one authorized source snapshot for lifecycle and exposure without a cross-request cache', async () => {
    const s = setup();
    const pair = await s.adapter.readPairedObservations(input);
    expect(pair.outcomes.observations).toHaveLength(1);
    expect(pair.exposure.observations).toHaveLength(1);
    expect(s.findMany).toHaveBeenCalledOnce();
    expect(s.manager).toHaveBeenCalledOnce();
    await s.adapter.readPairedObservations(input);
    expect(s.manager).toHaveBeenCalledTimes(2);
  });
  it('does not invent historical zero impressions; original completion summary stays intact', async () => {
    const s = setup();
    expect(
      (await s.exposure.readExposureObservations(request)).observations[0]?.metadata,
    ).toMatchObject({ uncertain: true });
    expect((await s.adapter.summarize(input)).buckets[0]?.completed).toBe(1);
  });
  it('tracks two first receipts with an exclusive cutoff and no private snapshot', async () => {
    const value = row();
    value.definitionSnapshot = { ...goal(), exposureTracking: 'social-support-exposure-v1' };
    value.firstDisplayedAt = new Date('2026-09-03Z');
    value.firstDetailsViewedAt = input.toExclusive;
    const result = await setup([value]).exposure.readExposureObservations(request);
    expect(result.observations[0]?.metadata).toEqual({
      displayedByCutoff: true,
      detailsViewedByCutoff: false,
      uncertain: false,
      pattern: 'P1',
    });
    expect(JSON.stringify(result)).not.toContain('private title');
  });
  it('distinguishes tracked but unreceived from legacy and rejects an unauthorized manager', async () => {
    const value = row();
    value.definitionSnapshot = { ...goal(), exposureTracking: 'social-support-exposure-v1' };
    expect(
      (await setup([value]).exposure.readExposureObservations(request)).observations[0]?.metadata,
    ).toMatchObject({ displayedByCutoff: false, detailsViewedByCutoff: false, uncertain: false });
    await expect(
      setup([value], false).exposure.readExposureObservations(request),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('marks malformed order uncertain and prevents cross-service exposure reads', async () => {
    const value = row();
    value.definitionSnapshot = { ...goal(), exposureTracking: 'social-support-exposure-v1' };
    value.firstDetailsViewedAt = new Date('2026-09-03Z');
    expect(
      (await setup([value]).exposure.readExposureObservations(request)).observations[0]?.metadata[
        'uncertain'
      ],
    ).toBe(true);
    await expect(
      setup([value]).exposure.readExposureObservations({
        ...request,
        scope: { ...request.scope, serviceId: 'other' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
