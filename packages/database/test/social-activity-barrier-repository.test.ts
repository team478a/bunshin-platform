import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaSocialActivityBarrierObservationRepository } from '../src/social-activity-barrier-repository';

const scope = {
  workspaceId: '10000000-0000-0000-0000-000000000001',
  serviceId: '20000000-0000-0000-0000-000000000001',
  groupMembershipId: '30000000-0000-0000-0000-000000000001',
  userId: '40000000-0000-0000-0000-000000000001',
  bunshinId: '50000000-0000-0000-0000-000000000001',
};

describe('PrismaSocialActivityBarrierObservationRepository', () => {
  it('collects only eligible scoped mission activity and excludes incident days', async () => {
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: scope.groupMembershipId }) },
      bunshin: { findFirst: vi.fn().mockResolvedValue({ id: scope.bunshinId }) },
      dailyMission: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'mission_1',
            missionDate: new Date('2026-09-01T00:00:00.000Z'),
            decision: { decision: 'ACCEPTED' },
            activities: [{ type: 'VIEWED' }, { type: 'COPIED_TEXT' }, { type: 'POSTED' }],
            postRecord: {
              manualMetrics: {
                comments: 1,
                businessOutcomes: {
                  inquiries: 1,
                  reservations: 0,
                  visits: 0,
                  repeatReservations: 1,
                  repeatVisits: 0,
                  orders: 0,
                  other: 0,
                },
              },
            },
            generationContext: { payload: { strategy: { goal: 'REPEAT' } } },
            lineMessageDeliveries: [{ status: 'SENT' }],
          },
          {
            id: 'mission_2',
            missionDate: new Date('2026-09-02T00:00:00.000Z'),
            decision: { decision: 'ACCEPTED' },
            activities: [{ type: 'VIEWED' }, { type: 'POSTED' }],
            postRecord: { manualMetrics: { comments: 10 } },
            generationContext: { payload: { strategy: { goal: 'INQUIRY' } } },
            lineMessageDeliveries: [{ status: 'FAILED' }],
          },
        ]),
      },
      dailyMissionGeneration: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ missionDate: new Date('2026-09-03T00:00:00.000Z') }]),
      },
      socialInsightSnapshot: { findMany: vi.fn().mockResolvedValue([{ interactions: 3 }]) },
      serviceMemberBusinessProfile: { findFirst: vi.fn().mockResolvedValue({ id: 'profile_1' }) },
    };
    const repository = new PrismaSocialActivityBarrierObservationRepository(
      client as unknown as PrismaClient,
    );

    const result = await repository.collect({
      scope,
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-08T00:00:00.000Z'),
    });

    expect(client.groupMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: scope.workspaceId,
          groupId: scope.serviceId,
          id: scope.groupMembershipId,
          userId: scope.userId,
          status: 'ACTIVE',
        }),
      }),
    );
    expect(client.bunshin.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: scope.workspaceId,
          groupId: scope.serviceId,
          id: scope.bunshinId,
          ownerUserId: scope.userId,
        }),
      }),
    );
    expect(result).toMatchObject({
      scope,
      observationWindow: { eligibleDays: 1, excludedSystemIncidentDays: 2 },
      metrics: {
        onboardingCompleted: true,
        lineDelivered: 1,
        missionViewed: 1,
        missionAccepted: 1,
        contentCopied: 1,
        postCompleted: 1,
        insightRecorded: 1,
        positiveResponseRecorded: 2,
        conversionActionRecorded: 1,
      },
      goalAttribution: {
        observedMissionCount: 1,
        attributedMissionCount: 1,
        unattributedMissionCount: 0,
        distinctAttributedGoalCount: 1,
        mixedAttributedGoals: false,
        missionCounts: { REPEAT: 1, UNATTRIBUTED: 0 },
      },
    });
  });

  it('attributes eligible missions to their generation goal and preserves unknown legacy missions', async () => {
    const mission = (id: string, goal: string | null) => ({
      id,
      missionDate: new Date(`2026-09-0${id}T00:00:00.000Z`),
      decision: null,
      activities: [{ type: 'VIEWED' }],
      postRecord: null,
      generationContext: goal === null ? null : { payload: { strategy: { goal } } },
      lineMessageDeliveries: [],
    });
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: scope.groupMembershipId }) },
      bunshin: { findFirst: vi.fn().mockResolvedValue({ id: scope.bunshinId }) },
      dailyMission: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            mission('1', 'INQUIRY'),
            mission('2', 'RECRUIT'),
            mission('3', null),
          ]),
      },
      dailyMissionGeneration: { findMany: vi.fn().mockResolvedValue([]) },
      socialInsightSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      serviceMemberBusinessProfile: { findFirst: vi.fn().mockResolvedValue({ id: 'profile_1' }) },
    };

    const result = await new PrismaSocialActivityBarrierObservationRepository(
      client as unknown as PrismaClient,
    ).collect({
      scope,
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-08T00:00:00.000Z'),
    });

    expect(result?.goalAttribution).toMatchObject({
      observedMissionCount: 3,
      attributedMissionCount: 2,
      unattributedMissionCount: 1,
      distinctAttributedGoalCount: 2,
      mixedAttributedGoals: true,
      missionCounts: { INQUIRY: 1, RECRUIT: 1, UNATTRIBUTED: 1 },
    });
  });

  it.each([
    ['reservations', 1],
    ['visits', 1],
    ['repeatReservations', 1],
    ['repeatVisits', 1],
    ['orders', 1],
  ])('counts nested %s as a conversion action', async (key, count) => {
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: scope.groupMembershipId }) },
      bunshin: { findFirst: vi.fn().mockResolvedValue({ id: scope.bunshinId }) },
      dailyMission: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'mission_1',
            missionDate: new Date('2026-09-01T00:00:00.000Z'),
            decision: null,
            activities: [{ type: 'POSTED' }],
            postRecord: { manualMetrics: { businessOutcomes: { [key]: count } } },
            lineMessageDeliveries: [],
          },
        ]),
      },
      dailyMissionGeneration: { findMany: vi.fn().mockResolvedValue([]) },
      socialInsightSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      serviceMemberBusinessProfile: { findFirst: vi.fn().mockResolvedValue({ id: 'profile_1' }) },
    };

    const result = await new PrismaSocialActivityBarrierObservationRepository(
      client as unknown as PrismaClient,
    ).collect({
      scope,
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-08T00:00:00.000Z'),
    });

    expect(result?.metrics.conversionActionRecorded).toBe(1);
  });

  it('counts a nested inquiry as a positive response without treating it as a generic conversion', async () => {
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: scope.groupMembershipId }) },
      bunshin: { findFirst: vi.fn().mockResolvedValue({ id: scope.bunshinId }) },
      dailyMission: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'mission_1',
            missionDate: new Date('2026-09-01T00:00:00.000Z'),
            decision: null,
            activities: [{ type: 'POSTED' }],
            postRecord: { manualMetrics: { businessOutcomes: { inquiries: 1 } } },
            lineMessageDeliveries: [],
          },
        ]),
      },
      dailyMissionGeneration: { findMany: vi.fn().mockResolvedValue([]) },
      socialInsightSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      serviceMemberBusinessProfile: { findFirst: vi.fn().mockResolvedValue({ id: 'profile_1' }) },
    };

    const result = await new PrismaSocialActivityBarrierObservationRepository(
      client as unknown as PrismaClient,
    ).collect({
      scope,
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-08T00:00:00.000Z'),
    });

    expect(result?.metrics).toMatchObject({
      positiveResponseRecorded: 1,
      conversionActionRecorded: 0,
    });
  });

  it('fails closed before reading activity when membership or bunshin scope does not match', async () => {
    const dailyMission = { findMany: vi.fn() };
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      bunshin: { findFirst: vi.fn().mockResolvedValue(null) },
      dailyMission,
    };
    const repository = new PrismaSocialActivityBarrierObservationRepository(
      client as unknown as PrismaClient,
    );

    await expect(
      repository.collect({
        scope,
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-08T00:00:00.000Z'),
      }),
    ).resolves.toBeNull();
    expect(dailyMission.findMany).not.toHaveBeenCalled();
  });
});
