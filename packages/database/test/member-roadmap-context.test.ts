import type { Prisma, PrismaClient } from '@prisma/client';
import {
  evaluateMemberRoadmap,
  aggregateMemberUsage,
  type MemberUsageRequest,
} from '@bunshin/application';
import { describe, expect, it, vi } from 'vitest';
import { evidenceTestPolicy } from './member-roadmap-policy-fixture';
import { PrismaMemberRoadmapContextRepository } from '../src/member-roadmap-context';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const asOf = new Date('2026-11-01T03:00:00Z');
const now = new Date('2026-11-03T00:00:00Z');
const request: MemberUsageRequest = {
  actorUserId: id(1),
  asOf,
  timezone: 'Asia/Tokyo',
  scope: {
    workspaceId: id(2),
    serviceId: id(3),
    groupMembershipId: id(4),
    userId: id(1),
    bunshinId: id(5),
  },
};
const policy = {
  featureKey: 'SOCIAL',
  status: 'ENABLED',
  startsAt: null,
  endsAt: null,
  dailyLimit: null,
  monthlyLimit: null,
};
function setup() {
  const current = {
    id: id(5),
    status: 'ACTIVE',
    capabilityAssignments: [{ id: id(6) }],
    socialProfiles: [{ id: id(7) }],
  };
  const tx = {
    serviceReferralQualificationPolicyVersion: { findFirst: vi.fn().mockResolvedValue(null) },
    serviceReferral: { count: vi.fn().mockResolvedValue(0) },
    $executeRaw: vi.fn().mockResolvedValue(0),
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: id(4) }) },
    bunshin: { findFirst: vi.fn().mockResolvedValue(current) },
    serviceLegalDocument: { findMany: vi.fn().mockResolvedValue([]) },
    serviceLegalConsent: { count: vi.fn().mockResolvedValue(0) },
    serviceOnboardingResponse: { findFirst: vi.fn().mockResolvedValue({ id: id(10) }) },
    socialProfile: { findFirst: vi.fn().mockResolvedValue({ id: id(7) }) },
    weeklyPlan: { findFirst: vi.fn().mockResolvedValue({ id: id(11) }) },
    missionActivity: { findFirst: vi.fn().mockResolvedValue({ id: id(12) }) },
    socialInsightSnapshot: { findFirst: vi.fn().mockResolvedValue({ id: id(13) }) },
    dailyMission: { findFirst: vi.fn().mockResolvedValue({ id: id(14) }) },
    featureDefinition: {
      findUnique: vi.fn().mockResolvedValue({ key: 'SOCIAL', parentKey: null, status: 'ACTIVE' }),
    },
    groupFeaturePolicy: { findMany: vi.fn().mockResolvedValue([policy]) },
    groupMemberFeatureAssignment: { findMany: vi.fn().mockResolvedValue([policy]) },
  };
  const transaction = vi.fn((read: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
    read(tx as unknown as Prisma.TransactionClient),
  );
  const repository = new PrismaMemberRoadmapContextRepository(
    { $transaction: transaction } as unknown as PrismaClient,
    () => now,
  );
  return { tx, transaction, current, repository };
}

describe('roadmap context DB projection', () => {
  it('reuses read-only snapshot authorization and existing entitlement resolution without quota writes', async () => {
    const s = setup();
    const value = await s.repository.read(request);
    expect(value).toMatchObject({
      scope: request.scope,
      asOf: asOf.toISOString(),
      timezone: request.timezone,
      facts: { INITIAL_SETUP: true, WEEKLY_PLAN: true, POST_PREPARATION: true, SNS_METRICS: true },
      validReferrals: null,
      features: { FIRST_DECISION: { readyForRecommendation: true, access: { allowed: true } } },
    });
    expect(s.tx.$executeRaw).toHaveBeenCalledWith(['SET TRANSACTION READ ONLY']);
    expect(s.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      maxWait: 3000,
      timeout: 20000,
    });
    expect(s.tx.groupFeaturePolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: id(2), groupId: id(3), featureKey: { in: ['SOCIAL'] } },
      }),
    );
    expect(s.tx.groupMemberFeatureAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: id(2),
          groupId: id(3),
          groupMembershipId: id(4),
          featureKey: { in: ['SOCIAL'] },
        },
      }),
    );
  });

  it.each(['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const)(
    'rejects omitted %s before Prisma can widen a filter',
    (key) => {
      const s = setup();
      const scope = { ...request.scope };
      Reflect.deleteProperty(scope, key);
      expect(() => s.repository.read({ ...request, scope })).toThrow(
        'invalid member usage request',
      );
      expect(s.transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'not/a/timezone'])('rejects invalid timezone %s before DB access', (timezone) => {
    const s = setup();
    expect(() => s.repository.read({ ...request, timezone })).toThrow('invalid roadmap timezone');
    expect(s.transaction).not.toHaveBeenCalled();
  });

  it('rejects actor spoofing and missing current membership without reading evidence', async () => {
    const s = setup();
    expect(await s.repository.read({ ...request, actorUserId: id(99) })).toBeNull();
    expect(s.tx.groupMembership.findFirst).not.toHaveBeenCalled();
    s.tx.groupMembership.findFirst.mockResolvedValue(null);
    expect(await s.repository.read(request)).toBeNull();
    expect(s.tx.socialProfile.findFirst).not.toHaveBeenCalled();
  });

  it('uses current time for ownership/consent, with no admin override', async () => {
    const s = setup();
    s.tx.serviceLegalDocument.findMany.mockResolvedValue([
      { id: id(20), type: 'TERMS', version: 1 },
    ]);
    expect(await s.repository.read(request)).toBeNull();
    expect(s.tx.socialProfile.findFirst).not.toHaveBeenCalled();
    expect(s.tx.bunshin.findFirst).not.toHaveBeenCalled();
    expect(s.tx.serviceLegalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          effectiveAt: { lte: now },
          workspaceId: id(2),
          groupId: id(3),
        }),
      }),
    );
    s.tx.serviceLegalConsent.count.mockResolvedValue(1);
    expect(await s.repository.read(request)).not.toBeNull();
    expect(s.tx.bunshin.findFirst).toHaveBeenCalledWith({
      where: {
        id: id(5),
        workspaceId: id(2),
        groupId: id(3),
        ownerUserId: id(1),
        status: { not: 'ARCHIVED' },
      },
      select: { id: true },
    });
  });

  it('filters historical proof by asOf while current capability and feature validity use now', async () => {
    const s = setup();
    await s.repository.read(request);
    expect(s.tx.serviceOnboardingResponse.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: id(2),
        groupId: id(3),
        groupMembershipId: id(4),
        userId: id(1),
        createdAt: { lte: asOf },
        completedAt: { lte: asOf },
      },
      select: { id: true },
    });
    expect(s.tx.weeklyPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: id(2),
          bunshinId: id(5),
          confirmedAt: { lte: asOf },
          status: { in: ['CONFIRMED', 'EXPIRED'] },
        }),
      }),
    );
    expect(s.tx.bunshin.findFirst.mock.calls[1]?.[0]).toMatchObject({
      select: {
        capabilityAssignments: { where: { activatedAt: { lte: now }, workspaceId: id(2) } },
      },
    });
  });

  it('never selects answer bodies, private content, individual SNS metrics or policy config', async () => {
    const s = setup();
    await s.repository.read(request);
    for (const [key, queries] of Object.entries(s.tx)) {
      if (key === '$executeRaw') continue;
      if ('findFirst' in queries)
        for (const [query] of queries.findFirst.mock.calls)
          expect(JSON.stringify(query.select)).not.toMatch(
            /answers|contentJson|followers|questionsSnapshot|memory|config/,
          );
    }
    expect(s.tx.groupFeaturePolicy.findMany.mock.calls[0]?.[0]).toMatchObject({
      select: {
        featureKey: true,
        status: true,
        dailyLimit: true,
        monthlyLimit: true,
        startsAt: true,
        endsAt: true,
      },
    });
  });

  it('retains missing/legacy proof and valid referral qualification as unknown', async () => {
    const s = setup();
    for (const queries of [
      s.tx.serviceOnboardingResponse,
      s.tx.socialProfile,
      s.tx.weeklyPlan,
      s.tx.missionActivity,
      s.tx.socialInsightSnapshot,
    ])
      queries.findFirst.mockResolvedValue(null);
    const value = await s.repository.read(request);
    expect(value?.facts).toEqual({
      INITIAL_SETUP: null,
      WEEKLY_PLAN: null,
      POST_PREPARATION: null,
      SNS_METRICS: null,
    });
    expect(value?.validReferrals).toBeNull();
    expect(value?.features.FIRST_GENERATION).toBeUndefined();
    expect(value?.facts.POST_HISTORY).toBeUndefined();
    expect(value?.facts.MUSE_GUIDE).toBeUndefined();
  });

  it('does not infer setup for another Bunshin from the membership questionnaire alone', async () => {
    const s = setup();
    s.tx.socialProfile.findFirst.mockResolvedValue(null);
    expect((await s.repository.read(request))?.facts.INITIAL_SETUP).toBeNull();
  });

  it.each(['capability', 'paused', 'profile', 'pending'] as const)(
    'honors current %s readiness without erasing historical achievement',
    async (reason) => {
      const s = setup();
      if (reason === 'capability') s.current.capabilityAssignments = [];
      if (reason === 'paused') s.current.status = 'PAUSED';
      if (reason === 'profile') s.current.socialProfiles = [];
      if (reason === 'pending') s.tx.dailyMission.findFirst.mockResolvedValue(null);
      const value = await s.repository.read(request);
      expect(value?.facts.INITIAL_SETUP).toBe(true);
      if (reason === 'profile')
        expect(value?.features.SNS_METRICS?.readyForRecommendation).toBe(false);
      else if (reason === 'pending')
        expect(value?.features.FIRST_DECISION?.readyForRecommendation).toBe(false);
      else expect(value?.features.FIRST_DECISION?.enabled).toBe(false);
    },
  );

  it('preserves existing explicit entitlement denial instead of granting access from membership/referrals', async () => {
    const s = setup();
    s.tx.groupMemberFeatureAssignment.findMany.mockResolvedValue([]);
    expect((await s.repository.read(request))?.features.FIRST_DECISION?.access).toMatchObject({
      allowed: false,
      reason: 'MEMBER_NOT_ALLOWED',
    });
  });

  it('provides a real non-AI next action for a member with an existing pending proposal', async () => {
    const s = setup();
    const context = await s.repository.read(request);
    if (!context) throw new Error('expected context');
    const usage = aggregateMemberUsage(request, {
      scope: request.scope,
      completeness: 'COMPLETE',
      generations: [],
      activities: [],
      decisions: [],
      postRecords: [],
      aiUsage: [],
    });
    expect(context).not.toHaveProperty('definition');
    expect(
      evaluateMemberRoadmap(
        request,
        usage,
        {
          ...context,
          definition: evidenceTestPolicy.createDefinition(request.scope),
        },
        evidenceTestPolicy,
      ).nextRecommended,
    ).toEqual({
      stageId: 'STEP_1',
      milestoneId: 'FIRST_DECISION',
    });
  });

  it('propagates a DB failure instead of returning an empty context', async () => {
    const s = setup();
    s.tx.weeklyPlan.findFirst.mockRejectedValue(new Error('synthetic failure'));
    await expect(s.repository.read(request)).rejects.toThrow('synthetic failure');
  });
});
