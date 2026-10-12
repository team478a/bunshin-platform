import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { ImprovementReadRequest } from '@bunshin/application';
import {
  PrismaSocialProgressImprovementAdapter,
  PrismaTrainingProgressImprovementAdapter,
} from '../src/service-improvement-progress';

const scope = {
  tenantRef: 'tenant',
  workspaceId: 'workspace',
  serviceId: 'service',
  packageKey: 'SOCIAL',
  adapterKey: 'SOCIAL_PROGRESS',
  environment: 'DEVELOPMENT' as const,
};
const input: ImprovementReadRequest = {
  actorUserId: 'admin',
  scope,
  fromInclusive: new Date('2026-09-01Z'),
  toExclusive: new Date('2026-10-01Z'),
  limit: 10,
  subject: null,
};
const trainingInput: ImprovementReadRequest = {
  ...input,
  scope: { ...scope, packageKey: 'TRAINING', adapterKey: 'TRAINING_PROGRESS' },
};
function mission() {
  return {
    id: 'mission',
    workspaceId: 'workspace',
    bunshinId: 'bunshin',
    createdAt: new Date('2026-09-02Z'),
    updatedAt: new Date('2026-09-04Z'),
    bunshin: { id: 'bunshin', workspaceId: 'workspace', groupId: 'service', ownerUserId: 'user' },
    decision: {
      workspaceId: 'workspace',
      bunshinId: 'bunshin',
      dailyMissionId: 'mission',
      decision: 'ACCEPTED',
      decidedAt: new Date('2026-09-03Z'),
      updatedAt: new Date('2026-09-03Z'),
    },
    postRecord: null as null | {
      workspaceId: string;
      bunshinId: string;
      dailyMissionId: string;
      actorUserId: string;
      postedAt: Date;
      createdAt: Date;
    },
  };
}
function assignment() {
  return {
    id: 'assignment',
    workspaceId: 'workspace',
    groupId: 'service',
    userId: 'user',
    presentedAt: new Date('2026-09-02Z'),
    updatedAt: new Date('2026-09-04Z'),
    startedAt: new Date('2026-09-03Z'),
    completedAt: new Date('2026-09-04Z'),
    submittedAt: new Date('2026-09-03Z'),
    answerUpdatedAt: new Date('2026-09-04Z'),
    evaluationStatus: 'READY',
    evaluatedAt: new Date('2026-09-04Z'),
  };
}
function setup() {
  const findMany = vi.fn().mockResolvedValue([mission()]);
  const queryRaw = vi.fn().mockResolvedValue([assignment()]);
  const manager = vi.fn().mockResolvedValue({ id: 'admin-membership' });
  const tx = {
    groupMembership: { findFirst: manager },
    dailyMission: { findMany },
    $queryRaw: queryRaw,
  };
  const transaction = vi.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx));
  const client = { $transaction: transaction } as unknown as PrismaClient;
  return {
    client,
    manager,
    findMany,
    queryRaw,
    transaction,
    social: new PrismaSocialProgressImprovementAdapter(client, scope),
    training: new PrismaTrainingProgressImprovementAdapter(client, trainingInput.scope),
  };
}
describe('scoped progress observation adapters', () => {
  it('reads only mission state and does not count acceptance as actual posting', async () => {
    const s = setup();
    const result = await s.social.readObservations(input);
    expect(result.observations[0]?.metadata).toEqual({
      accepted: true,
      rejected: false,
      posted: false,
      uncertain: false,
    });
    const query = s.findMany.mock.calls[0]?.[0] as Prisma.DailyMissionFindManyArgs;
    expect(query.take).toBe(11);
    expect(query.where).toMatchObject({
      workspaceId: 'workspace',
      bunshin: { groupId: 'service' },
    });
    const select = JSON.stringify(query.select);
    for (const key of ['rejectionDetail', 'content', 'postUrl', 'manualMetrics', 'memory'])
      expect(select).not.toContain(key);
    expect(s.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      timeout: 20_000,
    });
  });
  it('uses a recorded post separately and rejects another owner', async () => {
    const row = mission();
    row.postRecord = {
      workspaceId: 'workspace',
      bunshinId: 'bunshin',
      dailyMissionId: 'mission',
      actorUserId: 'user',
      postedAt: new Date('2026-09-04Z'),
      createdAt: new Date('2026-09-04Z'),
    };
    const s = setup();
    s.findMany.mockResolvedValue([row]);
    expect((await s.social.readObservations(input)).observations[0]?.metadata['posted']).toBe(true);
    row.postRecord.actorUserId = 'other';
    await expect(s.social.readObservations(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
  it('keeps late or missing decision evidence uncertain', async () => {
    const s = setup();
    const row = mission();
    row.decision.updatedAt = new Date('2026-10-02Z');
    s.findMany.mockResolvedValue([row]);
    expect((await s.social.readObservations(input)).observations[0]?.metadata).toMatchObject({
      accepted: false,
      uncertain: true,
    });
  });
  it('rejects inconsistent source ownership even without a subject filter', async () => {
    const s = setup();
    const row = mission();
    row.bunshin.groupId = 'other';
    s.findMany.mockResolvedValue([row]);
    await expect(s.social.readObservations(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
  it.each(['SOCIAL', 'TRAINING'])('denies non-admin before source queries: %s', async (kind) => {
    const s = setup();
    s.manager.mockResolvedValue(null);
    await expect(
      kind === 'SOCIAL'
        ? s.social.readObservations(input)
        : s.training.readObservations(trainingInput),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(s.findMany).not.toHaveBeenCalled();
    expect(s.queryRaw).not.toHaveBeenCalled();
  });
  it.each([
    'tenantRef',
    'workspaceId',
    'serviceId',
    'packageKey',
    'adapterKey',
    'environment',
  ] as const)('rejects different configured %s before transaction', async (key) => {
    const s = setup();
    await expect(
      s.social.readObservations({
        ...input,
        scope: { ...scope, [key]: key === 'environment' ? 'STAGING' : 'other' },
      }),
    ).rejects.toBeDefined();
    expect(s.transaction).not.toHaveBeenCalled();
  });
  it('applies subject constraints to User and Bunshin independently', async () => {
    const s = setup();
    await expect(
      s.social.readObservations({ ...input, subject: { userRef: 'other', bunshinRef: 'bunshin' } }),
    ).rejects.toBeDefined();
    const query = s.findMany.mock.calls[0]?.[0] as Prisma.DailyMissionFindManyArgs;
    expect(query.where).toMatchObject({ bunshin: { ownerUserId: 'other', id: 'bunshin' } });
  });
  it('captures input and configured scope before awaiting DB', async () => {
    const s = setup();
    const request = { ...input, scope: { ...scope }, fromInclusive: new Date(input.fromInclusive) };
    s.manager.mockImplementation(() => {
      request.scope.serviceId = 'other';
      request.actorUserId = 'other';
      request.fromInclusive.setFullYear(2030);
      return Promise.resolve({ id: 'admin' });
    });
    expect((await s.social.readObservations(request)).observations[0]?.scope.serviceId).toBe(
      'service',
    );
    const query = s.findMany.mock.calls[0]?.[0] as Prisma.DailyMissionFindManyArgs;
    expect(query.where).toMatchObject({ createdAt: { gte: new Date('2026-09-01Z') } });
  });
  it('projects training process state without pass, score, answers or personal result', async () => {
    const s = setup();
    const result = await s.training.readObservations(trainingInput);
    expect(result.observations[0]?.metadata).toEqual({
      started: true,
      completed: true,
      submitted: true,
      evaluationReady: true,
      evaluationFailed: false,
      uncertain: false,
    });
    expect(result.observations[0]?.bunshinRef).toBeNull();
    const query = s.queryRaw.mock.calls[0]?.[0] as Prisma.Sql;
    expect(query.sql).toContain('ans.evaluation_status');
    expect(query.sql).toContain('ans.user_id = m.user_id');
    expect(query.sql).toContain("m.service_role = 'PARTICIPANT'");
    expect(query.values).toContain(11);
    for (const key of [
      'ans.answer ',
      'ans.evaluation ',
      'display_snapshot',
      'skill_scores',
      'metadata',
    ])
      expect(query.sql).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain('PASS');
  });
  it('does not turn late evaluation into historical readiness', async () => {
    const s = setup();
    const row = assignment();
    row.answerUpdatedAt = new Date('2026-10-02Z');
    s.queryRaw.mockResolvedValue([row]);
    expect(
      (await s.training.readObservations(trainingInput)).observations[0]?.metadata,
    ).toMatchObject({ evaluationReady: false, uncertain: true });
  });
  it('does not turn a null READY timestamp into evaluated success', async () => {
    const s = setup();
    s.queryRaw.mockResolvedValue([{ ...assignment(), evaluatedAt: null }]);
    expect(
      (await s.training.readObservations(trainingInput)).observations[0]?.metadata,
    ).toMatchObject({ evaluationReady: false, uncertain: true });
  });
  it('rejects Bunshin subjects on a non-Bunshin training cohort', async () => {
    const s = setup();
    await expect(
      s.training.readObservations({
        ...trainingInput,
        subject: { userRef: 'user', bunshinRef: 'bunshin' },
      }),
    ).rejects.toBeDefined();
    expect(s.transaction).not.toHaveBeenCalled();
  });
  it('rejects another service or user in training projection', async () => {
    const s = setup();
    s.queryRaw.mockResolvedValue([{ ...assignment(), groupId: 'other' }]);
    await expect(s.training.readObservations(trainingInput)).rejects.toBeDefined();
    s.queryRaw.mockResolvedValue([assignment()]);
    await expect(
      s.training.readObservations({
        ...trainingInput,
        subject: { userRef: 'other', bunshinRef: null },
      }),
    ).rejects.toBeDefined();
  });
  it.each(['SOCIAL', 'TRAINING'])('uses limit+1 and reports partial %s', async (kind) => {
    const s = setup();
    const rows = Array.from({ length: 11 }, (_, i) => ({
      ...(kind === 'SOCIAL' ? mission() : assignment()),
      id: `row-${i}`,
    }));
    if (kind === 'SOCIAL') s.findMany.mockResolvedValue(rows);
    else s.queryRaw.mockResolvedValue(rows);
    if (kind === 'SOCIAL')
      for (const row of rows) if ('decision' in row) row.decision.dailyMissionId = row.id;
    const result = await (kind === 'SOCIAL'
      ? s.social.readObservations(input)
      : s.training.readObservations(trainingInput));
    expect(result.observations).toHaveLength(10);
    expect(result.coverage).toEqual({
      completeness: 'PARTIAL',
      missingCount: null,
      truncated: true,
    });
  });
  it('propagates DB errors and never fetches an external service', async () => {
    const s = setup();
    s.queryRaw.mockRejectedValue(new Error('DB failed'));
    const fetch = vi.fn(() => {
      throw new Error('external call');
    });
    vi.stubGlobal('fetch', fetch);
    try {
      await expect(s.training.readObservations(trainingInput)).rejects.toThrow('DB failed');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
