import { describe, expect, it, vi } from 'vitest';
import { PrismaSocialImageGenerationAuthorizationRepository } from '../src';

const input = {
  environment: 'PRODUCTION' as const,
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  groupMembershipId: '00000000-0000-4000-8000-000000000003',
  actorUserId: '00000000-0000-4000-8000-000000000004',
  bunshinId: '00000000-0000-4000-8000-000000000005',
  dailyMissionId: '00000000-0000-4000-8000-000000000006',
  campaignId: null,
  productPackVersionId: null,
  now: new Date('2026-08-28T10:00:00.000Z'),
};

const enrollment = {
  id: '00000000-0000-4000-8000-000000000007',
  pilotId: '00000000-0000-4000-8000-000000000008',
  pilot: { dailyLimit: 10, monthlyLimit: 100, memberMonthlyLimit: 20 },
};

function client(overrides: Record<string, unknown> = {}) {
  return {
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: input.groupMembershipId }) },
    featureDefinition: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ key: 'SOCIAL.IMAGE_GENERATION', parentKey: null, status: 'ACTIVE' }),
    },
    groupFeaturePolicy: {
      findMany: vi.fn().mockResolvedValue([
        {
          featureKey: 'SOCIAL.IMAGE_GENERATION',
          status: 'ENABLED',
          dailyLimit: null,
          monthlyLimit: null,
          startsAt: null,
          endsAt: null,
        },
      ]),
    },
    groupMemberFeatureAssignment: {
      findMany: vi.fn().mockResolvedValue([
        {
          featureKey: 'SOCIAL.IMAGE_GENERATION',
          status: 'ENABLED',
          dailyLimit: null,
          monthlyLimit: null,
          startsAt: null,
          endsAt: null,
        },
      ]),
    },
    bunshin: { findFirst: vi.fn().mockResolvedValue({ id: input.bunshinId }) },
    dailyMission: { findFirst: vi.fn().mockResolvedValue({ id: input.dailyMissionId }) },
    campaign: { findFirst: vi.fn() },
    socialImagePilotEnrollment: { findFirst: vi.fn().mockResolvedValue(enrollment) },
    socialImageGenerationRequest: { count: vi.fn().mockResolvedValue(0) },
    ...overrides,
  };
}

describe('PrismaSocialImageGenerationAuthorizationRepository', () => {
  it('authorizes only the exact active member scope and active pilot', async () => {
    const database = client();
    await expect(
      new PrismaSocialImageGenerationAuthorizationRepository(database as never).authorize(input),
    ).resolves.toEqual({
      allowed: true,
      pilotEnrollmentId: enrollment.id,
      generationContextSnapshotId: null,
    });
    expect(database.groupMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          id: input.groupMembershipId,
          userId: input.actorUserId,
        }),
      }),
    );
  });

  it('fails closed before any pilot lookup for a cross-group member', async () => {
    const database = client({ groupMembership: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(
      new PrismaSocialImageGenerationAuthorizationRepository(database as never).authorize(input),
    ).resolves.toEqual({ allowed: false, reason: 'MEMBERSHIP_UNAVAILABLE' });
    expect(database.socialImagePilotEnrollment.findFirst).not.toHaveBeenCalled();
  });

  it('blocks creation when a pilot limit is already reached', async () => {
    const database = client({
      socialImageGenerationRequest: {
        count: vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(10).mockResolvedValueOnce(2),
      },
    });
    await expect(
      new PrismaSocialImageGenerationAuthorizationRepository(database as never).authorize(input),
    ).resolves.toEqual({ allowed: false, reason: 'LIMIT_REACHED' });
  });
});
