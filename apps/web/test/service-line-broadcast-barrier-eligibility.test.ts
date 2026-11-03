import { describe, expect, it, vi } from 'vitest';
import { resolveServiceLineBroadcastRecipientIds } from '../src/jobs/service-line-broadcast-eligibility';

const recipient = {
  id: 'recipient-1',
  groupMembershipId: 'membership-1',
  userId: 'user-1',
  message: null,
};

function database(
  cases: Array<{
    id: string;
    groupMembershipId: string;
    userId: string;
    evidenceSnapshots?: { evidenceCode: string }[];
  }>,
) {
  return {
    prisma: {
      groupMembership: {
        findMany: vi.fn().mockResolvedValue([{ id: 'membership-1' }]),
      },
      socialActivityBarrierCase: { findMany: vi.fn().mockResolvedValue(cases) },
      lineConnection: {
        findMany: vi.fn().mockResolvedValue([{ userId: 'user-1', providerUserId: 'line-user-1' }]),
      },
    },
  };
}

const input = (db: ReturnType<typeof database>) => ({
  db: db as never,
  broadcast: {
    id: 'broadcast-1',
    workspaceId: 'workspace-1',
    groupId: 'group-1',
    message: '確認してください',
    updatedByUserId: 'operator-1',
    segmentCriteria: {
      kind: 'SOCIAL_ACTIVITY_BARRIER',
      bunshinId: 'bunshin-1',
      caseIds: ['case-1'],
    },
  },
  configuration: { id: 'line-config-1', encryptedAccessToken: 'encrypted' },
  environment: 'PRODUCTION' as const,
  mode: 'SHARED' as const,
  now: new Date('2026-11-03T00:00:00Z'),
  recipients: [recipient],
});

describe('social activity barrier broadcast eligibility', () => {
  it('keeps a consented recipient only while the scoped case is suspected', async () => {
    const db = database([{ id: 'case-1', groupMembershipId: 'membership-1', userId: 'user-1' }]);
    await expect(resolveServiceLineBroadcastRecipientIds(input(db))).resolves.toEqual(
      new Map([['membership-1', 'line-user-1']]),
    );
    expect(db.prisma.socialActivityBarrierCase.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['case-1'] },
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        bunshinId: 'bunshin-1',
        status: 'SUSPECTED',
        OR: [
          { nextEligibleAt: null },
          { nextEligibleAt: { lte: new Date('2026-11-03T00:00:00Z') } },
        ],
      },
      select: {
        id: true,
        groupMembershipId: true,
        userId: true,
        evidenceSnapshots: {
          orderBy: { detectedAt: 'desc' },
          take: 1,
          select: { evidenceCode: true },
        },
      },
    });
  });

  it('removes the recipient when the question was already answered', async () => {
    const db = database([]);
    await expect(resolveServiceLineBroadcastRecipientIds(input(db))).resolves.toEqual(new Map());
  });
});

it('does not repurpose existing barrier broadcasts for usage guidance', async () => {
  const db = database([
    {
      id: 'case-1',
      groupMembershipId: 'membership-1',
      userId: 'user-1',
      evidenceSnapshots: [{ evidenceCode: 'USAGE_REFERRAL_REVIEW' }],
    },
  ]);
  await expect(resolveServiceLineBroadcastRecipientIds(input(db))).resolves.toEqual(new Map());
});
