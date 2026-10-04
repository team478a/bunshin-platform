import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION as definition,
  type ImprovementReadRequest,
} from '@bunshin/application';
import { PrismaImprovementFeedbackObservationAdapter } from '../src/improvement-feedback-observation-adapter';
const scope = {
  workspaceId: 'workspace-a',
  serviceId: 'service-a',
  tenantRef: 'tenant-a',
  packageKey: 'SOCIAL',
  adapterKey: definition.key,
  environment: 'DEVELOPMENT' as const,
};
const input: ImprovementReadRequest = {
  actorUserId: 'manager-a',
  scope,
  fromInclusive: new Date('2026-10-01Z'),
  toExclusive: new Date('2026-10-03Z'),
  limit: 100,
  subject: null,
};
function row(id = 'report-a') {
  return {
    id,
    workspaceId: scope.workspaceId,
    serviceId: scope.serviceId,
    packageKey: 'SOCIAL',
    actorUserId: 'user-a',
    bunshinId: 'bunshin-a',
    createdAt: new Date('2026-10-02Z'),
    category: 'OPERATION',
    surface: 'TODAY',
    impact: 'BLOCKED',
    bunshin: {
      id: 'bunshin-a',
      workspaceId: scope.workspaceId,
      groupId: scope.serviceId,
      ownerUserId: 'user-a',
    },
    submissionKey: 'never-return',
    privateData: 'never-return',
  };
}
function setup(rows = [row()], allowed = true) {
  const manager = vi.fn().mockResolvedValue(allowed ? { id: 'manager' } : null);
  const findMany = vi.fn().mockResolvedValue(rows);
  const tx = { groupMembership: { findFirst: manager }, improvementFeedback: { findMany } };
  const transaction = vi.fn((callback: (value: typeof tx) => Promise<unknown>) => callback(tx));
  return {
    adapter: new PrismaImprovementFeedbackObservationAdapter(
      { $transaction: transaction } as never,
      scope,
    ),
    manager,
    findMany,
    transaction,
  };
}
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('external communication forbidden');
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('trouble feedback observation read adapter', () => {
  it('reauthorizes the service manager, selects only minimal source fields and reports without a population rate', async () => {
    const { adapter, manager, findMany, transaction } = setup();
    const summary = await adapter.summarize(input);
    expect(manager).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
        user: { status: 'ACTIVE' },
        group: {
          status: 'ACTIVE',
          workspace: { status: 'ACTIVE' },
          serviceConfiguration: { isNot: null },
        },
      },
      select: { id: true },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      timeout: 20_000,
    });
    const query = findMany.mock.calls[0]?.[0] as Prisma.ImprovementFeedbackFindManyArgs;
    expect(query).toMatchObject({
      where: {
        workspaceId: scope.workspaceId,
        serviceId: scope.serviceId,
        packageKey: 'SOCIAL',
        createdAt: { gte: input.fromInclusive, lt: input.toExclusive },
      },
      take: 101,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(Object.keys(query.select ?? {}).sort()).toEqual(
      [
        'id',
        'workspaceId',
        'serviceId',
        'packageKey',
        'actorUserId',
        'bunshinId',
        'createdAt',
        'category',
        'surface',
        'impact',
        'bunshin',
      ].sort(),
    );
    expect(query.where).not.toHaveProperty('category');
    expect(query.where).not.toHaveProperty('bunshin');
    expect(JSON.stringify(await adapter.readObservations(input))).not.toContain('never-return');
    expect(summary).toMatchObject({
      reports: 1,
      distinctReporters: 1,
      troubleIncidenceRate: null,
      resolutionRate: null,
      populationCoverage: 'UNKNOWN',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('refuses participants/editors/foreign or revoked admins before querying reports', async () => {
    const { adapter, findMany } = setup([], false);
    await expect(adapter.summarize(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(findMany).not.toHaveBeenCalled();
  });
  it.each([
    'workspaceId',
    'serviceId',
    'tenantRef',
    'packageKey',
    'adapterKey',
    'environment',
  ] as const)('refuses changed %s before DB access', async (field) => {
    const { adapter, transaction } = setup();
    await expect(
      adapter.readObservations({
        ...input,
        scope: { ...scope, [field]: field === 'environment' ? 'STAGING' : 'different' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(transaction).not.toHaveBeenCalled();
  });
  it('constrains the exact reporter and optional Bunshin', async () => {
    const { adapter, findMany } = setup();
    await adapter.readObservations({
      ...input,
      subject: { userRef: 'user-a', bunshinRef: 'bunshin-a' },
    });
    expect(findMany.mock.calls[0]?.[0].where).toMatchObject({
      actorUserId: 'user-a',
      bunshinId: 'bunshin-a',
    });
  });
  it('marks truncation partial and does not pretend the sentinel is a third report', async () => {
    const { adapter } = setup([row('a'), row('b'), row('c')]);
    const summary = await adapter.summarize({ ...input, limit: 2 });
    expect(summary).toMatchObject({
      reports: 2,
      distinctReporters: 1,
      coverage: { completeness: 'PARTIAL', missingCount: null, truncated: true },
      troubleIncidenceRate: null,
    });
  });
  it.each(['workspaceId', 'serviceId', 'packageKey', 'actorUserId', 'bunshinId'] as const)(
    'refuses corrupt source %s rather than relabeling',
    async (field) => {
      const { adapter } = setup([{ ...row(), [field]: 'foreign' }]);
      await expect(adapter.readObservations(input)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    },
  );
  it.each(['workspaceId', 'groupId', 'ownerUserId', 'id'] as const)(
    'refuses changed Bunshin %s without leaking new ownership',
    async (field) => {
      const original = row();
      const { adapter } = setup([
        { ...original, bunshin: { ...original.bunshin, [field]: 'private-foreign' } },
      ]);
      await expect(adapter.readObservations(input)).rejects.toThrow(
        'invalid feedback observation scope',
      );
    },
  );
  it('refuses period and subject violations even if a faulty repository returns them', async () => {
    const after = setup([{ ...row(), createdAt: input.toExclusive }]);
    await expect(after.adapter.readObservations(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    const subject = setup();
    await expect(
      subject.adapter.readObservations({
        ...input,
        subject: { userRef: 'other-user', bunshinRef: null },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('propagates DB failure and does not replace unavailable data with zero reports', async () => {
    const { adapter, findMany } = setup();
    findMany.mockRejectedValue(new Error('database unavailable'));
    await expect(adapter.summarize(input)).rejects.toThrow('database unavailable');
  });
  it('builds held evidence only after the same DB manager authorization and refuses revoked readers', async () => {
    const allowed = setup();
    const result = await allowed.adapter.reviewEvidence(input);
    expect(result.buckets[0]).toMatchObject({
      classification: 'UNKNOWN',
      reviewDecision: 'HELD',
      reports: 1,
      sourceRefs: [{ kind: 'IMPROVEMENT_FEEDBACK', id: 'report-a' }],
    });
    expect(allowed.manager).toHaveBeenCalledTimes(1);
    expect(allowed.findMany).toHaveBeenCalledTimes(1);
    const denied = setup([], false);
    await expect(denied.adapter.reviewEvidence(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(denied.findMany).not.toHaveBeenCalled();
  });
  it('snapshots scope, subject and period before awaiting authorization', async () => {
    const { adapter, manager, findMany } = setup();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    manager.mockImplementation(async () => {
      await barrier;
      return { id: 'manager' };
    });
    const mutable = {
      ...input,
      scope: { ...scope },
      subject: { userRef: 'user-a', bunshinRef: 'bunshin-a' },
      fromInclusive: new Date(input.fromInclusive),
      toExclusive: new Date(input.toExclusive),
    };
    const pending = adapter.summarize(mutable);
    mutable.scope.serviceId = 'foreign';
    mutable.subject.userRef = 'foreign';
    mutable.fromInclusive.setUTCFullYear(2030);
    release();
    const summary = await pending;
    expect(summary.reports).toBe(1);
    expect(summary.metric.scope).toEqual(scope);
    expect(summary.metric.fromInclusive).toEqual(input.fromInclusive);
    expect(findMany.mock.calls[0]?.[0].where).toMatchObject({
      serviceId: scope.serviceId,
      actorUserId: 'user-a',
      bunshinId: 'bunshin-a',
    });
  });
});
