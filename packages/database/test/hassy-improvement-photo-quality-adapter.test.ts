import type { PrismaClient } from '@prisma/client';
import type { ImprovementReadRequest } from '@bunshin/application';
import { describe, expect, it, vi } from 'vitest';
import { PrismaHassyPhotoQualityImprovementAdapter } from '../src/hassy-improvement-photo-quality-adapter';

const scope = {
  tenantRef: 'tenant-a',
  workspaceId: 'workspace-a',
  serviceId: 'hassy-a',
  packageKey: 'SOCIAL',
  adapterKey: 'HASSY_PHOTO_QUALITY',
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
function row(id = 'generation-a') {
  return {
    id,
    workspaceId: scope.workspaceId,
    bunshinId: 'bunshin-a',
    dailyMissionId: 'mission-a',
    actorUserId: 'user-a',
    status: 'SUCCEEDED',
    promptVersion: 'mission-content-variant-v1',
    qualityVerdict: 'PASS' as string | null,
    qualityScore: 90 as number | null,
    qualityIssueCodes: [] as string[],
    qualityRepairCount: 0,
    createdAt: new Date('2026-09-02Z'),
    updatedAt: new Date('2026-09-03Z'),
    dailyMission: {
      id: 'mission-a',
      workspaceId: scope.workspaceId,
      bunshinId: 'bunshin-a',
      bunshin: {
        id: 'bunshin-a',
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        ownerUserId: 'user-a',
      },
    },
    variant: {
      id: 'variant-a',
      workspaceId: scope.workspaceId,
      bunshinId: 'bunshin-a',
      dailyMissionId: 'mission-a',
      photoFirstMetadata: {
        id: 'photo-meta-a',
        workspaceId: scope.workspaceId,
        bunshinId: 'bunshin-a',
        dailyMissionId: 'mission-a',
        actorUserId: 'user-a',
      },
    } as {
      id: string;
      workspaceId: string;
      bunshinId: string;
      dailyMissionId: string;
      photoFirstMetadata: {
        id: string;
        workspaceId: string;
        bunshinId: string;
        dailyMissionId: string;
        actorUserId: string;
      } | null;
    } | null,
  };
}
function setup(rows = [row()], allowed = true) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const manager = vi.fn().mockResolvedValue(allowed ? { id: 'manager' } : null);
  const tx = {
    groupMembership: { findFirst: manager },
    missionContentVariantGeneration: { findMany },
  };
  const transaction = vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  return {
    adapter: new PrismaHassyPhotoQualityImprovementAdapter(
      { $transaction: transaction } as unknown as PrismaClient,
      scope,
    ),
    findMany,
    manager,
    transaction,
  };
}
describe('Hassy photo quality improvement read adapter', () => {
  it('includes explicitly attributed failures before quality checking without claiming population completeness', async () => {
    const failed = {
      ...row(),
      initiatingSource: 'PHOTO_FIRST',
      status: 'FAILED',
      variant: null,
      qualityVerdict: null,
      qualityScore: null,
    };
    const { adapter, findMany } = setup([failed]);
    const summary = await adapter.summarize(input);
    expect(summary.groups.find((group) => group.attribution === 'PHOTO_STARTED')).toMatchObject({
      observed: 1,
      checked: 0,
      generationFailed: 1,
      observedCheckedPassRate: null,
    });
    expect(summary.photoFirstPopulationPassRate).toBeNull();
    expect(summary.photoFirstPopulationCoverage).toBe('UNKNOWN');
    expect(findMany.mock.calls[0]?.[0].select.initiatingSource).toBe(true);
  });
  it('reads a service cohort, not a filtered list of issues or successful photos only', async () => {
    const { adapter, findMany, manager } = setup();
    const summary = await adapter.summarize(input);
    expect(summary.groups[0]).toMatchObject({
      observed: 1,
      checked: 1,
      pass: 1,
      observedCheckedPassRate: 1,
    });
    expect(summary).toMatchObject({
      photoFirstPopulationPassRate: null,
      photoFirstPopulationCoverage: 'UNKNOWN',
    });
    const query = findMany.mock.calls[0]?.[0];
    expect(query).toMatchObject({
      take: 101,
      where: {
        workspaceId: scope.workspaceId,
        createdAt: { gte: input.fromInclusive, lt: input.toExclusive },
        dailyMission: { bunshin: { groupId: scope.serviceId } },
      },
    });
    expect(query.where).not.toHaveProperty('qualityIssueCodes');
    expect(query.where).not.toHaveProperty('status');
    expect(query.select.variant.select.photoFirstMetadata.select).not.toHaveProperty(
      'analysisJson',
    );
    expect(query.select).not.toHaveProperty('idempotencyKey');
    expect(query.select).not.toHaveProperty('estimatedCostMicros');
    expect(manager).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: input.actorUserId,
          serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
        }),
      }),
    );
  });
  it('denies a participant before source query', async () => {
    const { adapter, findMany } = setup([], false);
    await expect(adapter.summarize(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(findMany).not.toHaveBeenCalled();
  });
  it.each([
    'tenantRef',
    'workspaceId',
    'serviceId',
    'adapterKey',
    'packageKey',
    'environment',
  ] as const)('rejects configured %s mismatch before DB', async (key) => {
    const { adapter, transaction } = setup();
    await expect(
      adapter.readObservations({
        ...input,
        scope: { ...scope, [key]: key === 'environment' ? 'STAGING' : 'other' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each(['workspaceId', 'bunshinId', 'dailyMissionId', 'actorUserId'] as const)(
    'rejects returned foreign generation %s',
    async (key) => {
      const value = row();
      value[key] = 'foreign';
      await expect(setup([value]).adapter.summarize(input)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    },
  );
  it('rejects a Bunshin in another service', async () => {
    const value = row();
    value.dailyMission.bunshin.groupId = 'other-service';
    await expect(setup([value]).adapter.summarize(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
  it('rejects a foreign metadata owner before classifying a photo', async () => {
    const value = row();
    value.variant!.photoFirstMetadata!.actorUserId = 'other-user';
    await expect(setup([value]).adapter.summarize(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
  it('filters and verifies explicit user and Bunshin', async () => {
    const { adapter, findMany } = setup();
    await adapter.summarize({ ...input, subject: { userRef: 'user-a', bunshinRef: 'bunshin-a' } });
    expect(findMany.mock.calls[0]?.[0].where.dailyMission.bunshin).toMatchObject({
      ownerUserId: 'user-a',
      id: 'bunshin-a',
    });
    await expect(
      adapter.summarize({ ...input, subject: { userRef: 'other-user', bunshinRef: 'bunshin-a' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      adapter.summarize({ ...input, subject: { userRef: 'user-a', bunshinRef: 'other-bunshin' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('separates repaired pass, final rejection, unchecked and pending, never puts unchecked into checked denominator', async () => {
    const repaired = row('repair');
    repaired.qualityRepairCount = 1;
    repaired.qualityIssueCodes = ['PHOTO_FIRST_UNCONFIRMED_FACT'];
    const rejected = row('reject');
    rejected.status = 'FAILED';
    rejected.qualityVerdict = 'REJECT';
    rejected.variant = null;
    rejected.qualityIssueCodes = ['PHOTO_FIRST_UNCONFIRMED_FACT'];
    const unchecked = row('unchecked');
    unchecked.status = 'FAILED';
    unchecked.qualityVerdict = null;
    unchecked.qualityScore = null;
    unchecked.variant = null;
    const pending = { ...unchecked, id: 'pending', status: 'PROCESSING' };
    const result = await setup([repaired, rejected, unchecked, pending]).adapter.summarize(input);
    expect(result.groups[0]).toMatchObject({
      repairedPass: 1,
      pass: 0,
      unconfirmedFactObserved: 1,
    });
    expect(result.groups[1]).toMatchObject({
      attribution: 'PHOTO_ISSUE_SIGNAL',
      finalReject: 1,
      checked: 1,
      generationFailed: 1,
    });
    expect(result.groups[2]).toMatchObject({
      unchecked: 1,
      pending: 1,
      checked: 0,
      observedCheckedPassRate: null,
    });
    expect(result.attributionUnresolved).toBe(2);
  });
  it('holds a rate when a linked Photo First generation has no quality audit', async () => {
    const value = row();
    value.qualityVerdict = null;
    value.qualityScore = null;
    const result = await setup([row('pass'), value]).adapter.summarize(input);
    expect(result.groups[0]).toMatchObject({
      observed: 2,
      checked: 1,
      unchecked: 1,
      observedCheckedPassRate: null,
      metric: { denominator: 1, coverage: { completeness: 'PARTIAL', missingCount: 1 } },
    });
  });
  it('does not classify ordinary or legacy generation as non-photo from missing metadata', async () => {
    const value = row();
    value.variant!.photoFirstMetadata = null;
    const result = await setup([value]).adapter.summarize(input);
    expect(result.attributionUnresolved).toBe(1);
    expect(result.groups[2]?.observed).toBe(1);
  });
  it('preserves lookahead truncation and unknown total, suppressing all group rates', async () => {
    const result = await setup([row('a'), row('b')]).adapter.summarize({ ...input, limit: 1 });
    expect(result.coverage).toEqual({
      completeness: 'PARTIAL',
      missingCount: null,
      truncated: true,
    });
    expect(result.groups[0]).toMatchObject({ observed: 1, observedCheckedPassRate: null });
  });
  it('retains unknown issue only as a count and does not return free text or current data', async () => {
    const value = row();
    value.qualityIssueCodes = ['private-issue-body'];
    value.promptVersion = 'private-prompt';
    const observations = await setup([value]).adapter.readObservations(input);
    expect(observations.observations[0]?.metadata).toMatchObject({
      unknownIssueCount: 1,
      recordedPromptVersion: 'UNAVAILABLE',
    });
    expect(JSON.stringify(observations)).not.toContain('private-');
  });
  it('does not reuse completion updated after the cutoff as historical quality', async () => {
    const value = row();
    value.updatedAt = input.toExclusive;
    value.qualityIssueCodes = ['PHOTO_FIRST_UNCONFIRMED_FACT'];
    const result = await setup([value]).adapter.summarize(input);
    expect(result.groups[0]).toMatchObject({
      afterCutoff: 1,
      checked: 0,
      observedCheckedPassRate: null,
      issueObserved: 0,
      unconfirmedFactObserved: 0,
    });
  });
  it('rejects an out-of-period source even if a faulty DB fake returns it', async () => {
    const value = row();
    value.createdAt = input.toExclusive;
    await expect(setup([value]).adapter.summarize(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
  it('returns empty buckets with null rates and no invented costs', async () => {
    const result = await setup([]).adapter.summarize(input);
    expect(
      result.groups.every(
        (group) =>
          group.observedCheckedPassRate === null && group.metric.cost.confirmedUsdMicros === null,
      ),
    ).toBe(true);
  });
  it('rejects invalid bounds before any DB access', async () => {
    const { adapter, transaction } = setup();
    await expect(adapter.readObservations({ ...input, limit: 0 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
