import { SOCIAL_USAGE_GUIDANCE_KEYS } from '@bunshin/capability-social';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { getSocialActivityBarrierServiceSummary } from '../src/social-activity-barrier-summary';

describe('social activity barrier service summary', () => {
  it('aggregates confirmed categories and support states without returning member data', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        category: 'TIME',
        status: 'CONFIRMED',
        supportActions: [{ status: 'ACCEPTED' }, { status: 'COMPLETED' }],
      },
      {
        category: 'TIME',
        status: 'CONFIRMED',
        supportActions: [{ status: 'OFFERED' }],
      },
      { category: 'CONTENT', status: 'SUSPECTED', supportActions: [] },
      {
        category: 'EFFECT',
        status: 'CONFIRMED',
        supportActions: [{ status: 'COMPLETED' }],
        evidenceSnapshots: [{ evidenceCode: 'USAGE_REFERRAL_REVIEW' }],
      },
      {
        category: 'HOW_TO',
        status: 'RESOLVED',
        supportActions: [{ status: 'SKIPPED' }],
      },
    ]);
    const client = {
      socialActivityBarrierCase: { findMany },
    } as unknown as PrismaClient;

    const result = await getSocialActivityBarrierServiceSummary(client, {
      workspaceId: 'workspace_1',
      groupId: 'service_1',
    });

    expect(result).toEqual({
      cases: { suspected: 1, confirmed: 2, resolved: 1, dismissed: 0 },
      support: { offered: 1, accepted: 1, completed: 1, skipped: 1 },
      confirmedCategories: [{ category: 'TIME', label: '取り組む時間がない', count: 2 }],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace_1',
        groupId: 'service_1',
        groupMembership: { status: 'ACTIVE' },
      },
      select: {
        evidenceSnapshots: {
          orderBy: { detectedAt: 'desc' },
          take: 1,
          select: { evidenceCode: true },
        },
        category: true,
        status: true,
        supportActions: {
          where: { supportKey: { notIn: [...SOCIAL_USAGE_GUIDANCE_KEYS] } },
          select: { status: true },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('userId');
    expect(JSON.stringify(result)).not.toContain('displayName');
  });
});
