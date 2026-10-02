import type { PrismaClient } from '@prisma/client';
import {
  buildSocialActivityBarrierGoalAttribution,
  buildSocialActivityBarrierGoalMetrics,
} from '@bunshin/capability-social';
import { describe, expect, it, vi } from 'vitest';
import { PrismaSocialActivityBarrierConfirmationRepository } from '../src/social-activity-barrier-confirmation-repository';

const scope = {
  workspaceId: '10000000-0000-0000-0000-000000000001',
  serviceId: '20000000-0000-0000-0000-000000000001',
  groupMembershipId: '30000000-0000-0000-0000-000000000001',
  userId: '40000000-0000-0000-0000-000000000001',
  bunshinId: '50000000-0000-0000-0000-000000000001',
};

const evidence = {
  evidenceCode: 'LOW_MISSION_ADOPTION',
  observationFrom: new Date('2026-09-01T00:00:00.000Z'),
  observationTo: new Date('2026-09-08T00:00:00.000Z'),
  eligibleDays: 7,
  excludedSystemIncidentDays: 0,
  metrics: {},
  thresholds: {},
  ruleVersion: 'social-activity-barrier-v1',
};

function barrierCase(id: string, category: 'TIME' | 'EFFORT' | 'LEAD') {
  return {
    id,
    category,
    status: 'SUSPECTED' as const,
    ruleVersion: 'social-activity-barrier-v1',
    recurrenceCount: 1,
    firstDetectedAt: new Date('2026-09-08T00:00:00.000Z'),
    lastDetectedAt: new Date('2026-09-08T00:00:00.000Z'),
    nextEligibleAt: null,
    evidenceSnapshots: [evidence],
  };
}

function inquiryLeadCase() {
  const value = barrierCase('case_lead', 'LEAD');
  value.ruleVersion = 'social-activity-barrier-v3';
  value.evidenceSnapshots = [
    {
      ...evidence,
      evidenceCode: 'RESPONSE_WITHOUT_NEXT_STEP',
      ruleVersion: 'social-activity-barrier-v3',
      metrics: {
        goalAttribution: buildSocialActivityBarrierGoalAttribution(['INQUIRY', 'INQUIRY']),
        goalMetrics: buildSocialActivityBarrierGoalMetrics(
          [
            {
              goal: 'INQUIRY',
              postCompleted: true,
              positiveResponseRecorded: true,
              conversionActionRecorded: false,
            },
            {
              goal: 'INQUIRY',
              postCompleted: true,
              positiveResponseRecorded: true,
              conversionActionRecorded: false,
            },
          ],
          { insightRecorded: 0, positiveResponseRecorded: 0 },
        ),
      },
      thresholds: { minimumPositiveResponses: 2, maximumConversionActions: 0 },
    },
  ];
  return value;
}

function barrierCaseWithMixedGoals(id: string, category: 'TIME' | 'EFFORT') {
  const value = barrierCase(id, category);
  value.ruleVersion = 'social-activity-barrier-v2';
  value.evidenceSnapshots = [
    {
      ...evidence,
      ruleVersion: 'social-activity-barrier-v2',
      metrics: {
        goalAttribution: buildSocialActivityBarrierGoalAttribution(['INQUIRY', 'RECRUIT']),
      },
    },
  ];
  return value;
}

describe('PrismaSocialActivityBarrierConfirmationRepository', () => {
  it('confirms only the selected case, dismisses siblings, and offers one support action', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const confirmationCreate = vi.fn().mockResolvedValue({ id: 'confirmation_1' });
    const supportCreate = vi.fn().mockResolvedValue({ id: 'support_1' });
    const tx = {
      socialActivityBarrierConfirmation: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: confirmationCreate,
      },
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: scope.groupMembershipId }) },
      bunshin: { findFirst: vi.fn().mockResolvedValue({ id: scope.bunshinId }) },
      socialActivityBarrierCase: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            barrierCaseWithMixedGoals('case_time', 'TIME'),
            barrierCaseWithMixedGoals('case_effort', 'EFFORT'),
          ]),
        updateMany,
      },
      socialActivitySupportIntervention: { create: supportCreate },
    };
    const client = {
      $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaClient;
    const repository = new PrismaSocialActivityBarrierConfirmationRepository(client);

    const result = await repository.answer({
      scope,
      caseIds: ['case_time', 'case_effort'],
      selectedCaseId: 'case_time',
      idempotencyKey: 'barrier-answer-001',
      answeredAt: new Date('2026-09-09T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      response: 'CONFIRMED',
      support: { key: 'FIVE_MINUTE_ACTION' },
    });
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMED' }) }),
    );
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ status: 'DISMISSED' }) }),
    );
    expect(confirmationCreate).toHaveBeenCalledOnce();
    expect(supportCreate).toHaveBeenCalledOnce();
    expect(supportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ruleVersion: 'social-activity-support-v3',
        definitionSnapshot: expect.objectContaining({
          selection: {
            mode: 'COMMON',
            eligibleGoal: null,
            fallbackReason: 'MIXED_GOALS',
          },
        }),
      }),
    });
  });

  it('rejects an idempotency record owned by another scope', async () => {
    const tx = {
      socialActivityBarrierConfirmation: {
        findUnique: vi.fn().mockResolvedValue({
          response: 'CONFIRMED',
          selectedCategory: 'TIME',
          barrierCase: { ...scope, groupId: scope.serviceId, workspaceId: 'other-workspace' },
        }),
      },
    };
    const client = {
      $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaClient;
    const repository = new PrismaSocialActivityBarrierConfirmationRepository(client);

    await expect(
      repository.answer({
        scope,
        caseIds: ['case_time'],
        selectedCaseId: 'case_time',
        idempotencyKey: 'barrier-answer-001',
        answeredAt: new Date('2026-09-09T00:00:00.000Z'),
      }),
    ).resolves.toBeNull();
  });

  it('snapshots a Goal-specific support selected from the persisted evidence', async () => {
    const supportCreate = vi.fn().mockResolvedValue({ id: 'support_goal_1' });
    const tx = {
      socialActivityBarrierConfirmation: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'confirmation_goal_1' }),
      },
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: scope.groupMembershipId }) },
      bunshin: { findFirst: vi.fn().mockResolvedValue({ id: scope.bunshinId }) },
      socialActivityBarrierCase: {
        findMany: vi.fn().mockResolvedValue([inquiryLeadCase()]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      socialActivitySupportIntervention: { create: supportCreate },
    };
    const client = {
      $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaSocialActivityBarrierConfirmationRepository(client).answer({
        scope,
        caseIds: ['case_lead'],
        selectedCaseId: 'case_lead',
        idempotencyKey: 'barrier-goal-answer-001',
        answeredAt: new Date('2026-09-09T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      response: 'CONFIRMED',
      support: { key: 'INQUIRY_LEAD_FOLLOW_UP' },
    });
    expect(supportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        supportKey: 'INQUIRY_LEAD_FOLLOW_UP',
        ruleVersion: 'social-activity-support-v3',
        definitionSnapshot: expect.objectContaining({
          selection: {
            mode: 'GOAL_SPECIFIC',
            eligibleGoal: 'INQUIRY',
            fallbackReason: null,
          },
        }),
      }),
    });
  });

  it('restores an active support action only through its complete scope', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: '60000000-0000-0000-0000-000000000001',
      status: 'OFFERED',
      definitionSnapshot: {
        key: 'FIVE_MINUTE_ACTION',
        title: '5分で終わる内容にする',
        reason: '作業量を小さくします。',
        steps: ['投稿を開く', '一文選ぶ', '保存する'],
      },
    });
    const client = {
      socialActivitySupportIntervention: { findFirst },
    } as unknown as PrismaClient;
    const repository = new PrismaSocialActivityBarrierConfirmationRepository(client);

    await expect(repository.getActiveSupport({ scope })).resolves.toMatchObject({
      status: 'OFFERED',
      support: { key: 'FIVE_MINUTE_ACTION' },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          barrierCase: expect.objectContaining({
            workspaceId: scope.workspaceId,
            groupId: scope.serviceId,
            groupMembershipId: scope.groupMembershipId,
            userId: scope.userId,
            bunshinId: scope.bunshinId,
          }),
        }),
      }),
    );
  });

  it('transitions support once and treats the same completed action as idempotent', async () => {
    const snapshot = {
      key: 'FIVE_MINUTE_ACTION',
      title: '5分で終わる内容にする',
      reason: '作業量を小さくします。',
      steps: ['投稿を開く', '一文選ぶ', '保存する'],
    };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: 'support_1', status: 'ACCEPTED', definitionSnapshot: snapshot })
      .mockResolvedValueOnce({
        id: 'support_1',
        status: 'COMPLETED',
        definitionSnapshot: snapshot,
      });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      socialActivitySupportIntervention: { findFirst, updateMany },
    } as unknown as PrismaClient;
    const repository = new PrismaSocialActivityBarrierConfirmationRepository(client);
    const input = {
      scope,
      supportId: 'support_1',
      action: 'COMPLETE' as const,
      occurredAt: new Date('2026-09-10T00:00:00.000Z'),
    };

    await expect(repository.transitionSupport(input)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    await expect(repository.transitionSupport(input)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    expect(updateMany).toHaveBeenCalledOnce();
  });
});
