import { describe, expect, it } from 'vitest';
import type { PersonalLearningTextOperation } from '@bunshin/application';
import { PrismaPersonalLearningTextOperationRepository } from '../src/personal-learning-text-operation';

const operation = {
  actor: {
    actorUserId: '11111111-1111-4111-8111-111111111111',
    scope: {
      workspaceId: 'workspace',
      groupId: 'group',
      programEnrollmentId: 'enrollment',
      groupMembershipId: 'membership',
      userId: 'user',
    },
  },
  requestId: '22222222-2222-4222-8222-222222222222',
  expectedRequestRevision: 1,
  operationId: '33333333-3333-4333-8333-333333333333',
  operationKind: 'SIDE_HUSTLE_ROADMAP_REVISION',
  attempt: 1,
  provider: 'openai',
  promptVersion: 'side-hustle-roadmap-revision-v1',
  policy: {
    workspaceId: 'workspace',
    groupId: 'group',
    serviceProgramId: 'program',
    model: 'model',
    maxRequestBytes: 1000,
    maxOutputTokens: 1000,
  },
  pricingRegistry: [],
} as unknown as PersonalLearningTextOperation;

function repositoryAtDailyCount(count: number) {
  let quotaWhere: unknown;
  const tx = {
    programActionEvent: { findFirst: () => Promise.resolve({ id: operation.requestId }) },
    serviceProgram: { findFirst: () => Promise.resolve({ id: 'program' }) },
    $queryRaw: () => Promise.resolve([{ now: new Date('2026-10-23T00:00:00.000Z') }]),
    $executeRaw: () => Promise.resolve(1),
    personalLearningCallAdmission: {
      count: (args: { where: unknown }) => {
        quotaWhere = args.where;
        return Promise.resolve(count);
      },
    },
  };
  const repository = new PrismaPersonalLearningTextOperationRepository({} as never);
  const invoke = repository as unknown as {
    assertSideHustleRoadmapAdmission: (
      tx: unknown,
      input: PersonalLearningTextOperation,
    ) => Promise<void>;
  };
  return {
    run: () => invoke.assertSideHustleRoadmapAdmission(tx, operation),
    getWhere: () => quotaWhere,
  };
}

describe('side-hustle roadmap daily admission', () => {
  it('combines initial maps and revisions into the same five-call daily limit', async () => {
    const fiveCalls = repositoryAtDailyCount(5);
    await expect(fiveCalls.run()).rejects.toMatchObject({ code: 'CONFLICT' });
    const where = JSON.stringify(fiveCalls.getWhere());
    expect(where).toContain('SIDE_HUSTLE_ROADMAP');
    expect(where).toContain('SIDE_HUSTLE_ROADMAP_REVISION');
    await expect(repositoryAtDailyCount(4).run()).resolves.toBeUndefined();
  });
});
