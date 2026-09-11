import { describe, expect, it, vi } from 'vitest';
import {
  hasActiveRewardsPilotAccess,
  REWARDS_PILOT_FEATURE_KEY,
} from '../src/rewards-pilot-access';
import { readFileSync } from 'node:fs';

const repository = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('rewards pilot access', () => {
  it('requires an active group policy and an active assignment for the same member', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'membership-1' });
    const at = new Date('2026-09-11T00:00:00.000Z');

    await expect(
      hasActiveRewardsPilotAccess(
        { groupMembership: { findFirst } } as never,
        { workspaceId: 'workspace-1', groupId: 'group-1', userId: 'user-1' },
        at,
      ),
    ).resolves.toBe(true);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          groupId: 'group-1',
          userId: 'user-1',
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: expect.objectContaining({
            featurePolicies: {
              some: expect.objectContaining({ featureKey: REWARDS_PILOT_FEATURE_KEY }),
            },
          }),
          featureAssignments: {
            some: expect.objectContaining({ featureKey: REWARDS_PILOT_FEATURE_KEY }),
          },
        }),
      }),
    );
  });

  it('denies access when no exact active membership matches', async () => {
    await expect(
      hasActiveRewardsPilotAccess(
        { groupMembership: { findFirst: vi.fn().mockResolvedValue(null) } } as never,
        { workspaceId: 'workspace-1', userId: 'user-1' },
      ),
    ).resolves.toBe(false);
  });

  it('limits the pilot to 30 enabled participant assignments', () => {
    expect(repository).toContain("input.featureKey === 'REWARDS.POINTS_BADGES'");
    expect(repository).toContain('if (otherEnabledMembers >= 30)');
    expect(repository).toContain("'rewards pilot member limit reached'");
  });
});
