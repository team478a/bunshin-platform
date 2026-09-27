import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaSocialActivityBarrierProjectionCandidateRepository } from '../src/social-activity-barrier-repository';

describe('social activity barrier projection candidates', () => {
  it('returns every active social Bunshin only from explicitly enabled services', async () => {
    const groupMembership = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 'membership', workspaceId: 'workspace', groupId: 'service', userId: 'user' },
        ]),
    };
    const bunshin = {
      findMany: vi.fn().mockResolvedValue([
        { id: 'b1', workspaceId: 'workspace', groupId: 'service', ownerUserId: 'user' },
        { id: 'b2', workspaceId: 'workspace', groupId: 'service', ownerUserId: 'user' },
      ]),
    };
    const repository = new PrismaSocialActivityBarrierProjectionCandidateRepository({
      groupMembership,
      bunshin,
    } as unknown as PrismaClient);
    await expect(
      repository.list({ limit: 100, at: new Date('2026-09-27T00:00:00Z') }),
    ).resolves.toHaveLength(2);
    expect(groupMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          serviceRole: 'PARTICIPANT',
          group: expect.objectContaining({
            featurePolicies: {
              some: expect.objectContaining({
                featureKey: 'SOCIAL.ACTIVITY_SUPPORT',
                status: 'ENABLED',
              }),
            },
          }),
        }),
      }),
    );
    expect(bunshin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          socialProfiles: { some: { status: 'ACTIVE' } },
        }),
      }),
    );
  });
});
