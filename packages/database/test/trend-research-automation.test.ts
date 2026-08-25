import { describe, expect, it, vi } from 'vitest';
import {
  PrismaTrendResearchAutomationCandidateRepository,
  PrismaTrendResearchExpiryRepository,
  PrismaTrendResearchGenerationContextRepository,
} from '../src';

describe('Prisma trend research automation repositories', () => {
  it('selects only active scoped profiles and returns the Bunshin owner as actor', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'profile-1',
        workspaceId: 'workspace-1',
        bunshinId: 'bunshin-1',
        bunshin: { ownerUserId: 'user-1' },
      },
    ]);
    const result = await new PrismaTrendResearchAutomationCandidateRepository({
      socialProfile: { findMany },
    } as never).listEligible(10);
    expect(result.candidates).toEqual([
      {
        workspaceId: 'workspace-1',
        bunshinId: 'bunshin-1',
        actorUserId: 'user-1',
        socialProfileId: 'profile-1',
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          accountStrategies: { some: { status: 'APPROVED' } },
        }),
        take: 11,
      }),
    );
  });

  it('does not return a context from another Workspace or Bunshin', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(
      new PrismaTrendResearchGenerationContextRepository({
        socialProfile: { findFirst },
      } as never).get({
        workspaceId: 'workspace-a',
        bunshinId: 'bunshin-a',
        actorUserId: 'user-a',
        socialProfileId: 'profile-b',
      }),
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'profile-b',
          workspaceId: 'workspace-a',
          bunshinId: 'bunshin-a',
        }),
      }),
    );
  });

  it('does not expire anything when actor scope is unavailable', async () => {
    const updateMany = vi.fn();
    const result = await new PrismaTrendResearchExpiryRepository({
      bunshin: { findFirst: vi.fn().mockResolvedValue(null) },
      trendResearchRun: { updateMany },
    } as never).expire({
      workspaceId: 'workspace-a',
      bunshinId: 'bunshin-a',
      actorUserId: 'user-b',
      at: new Date('2026-08-25T00:00:00.000Z'),
    });
    expect(result).toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
