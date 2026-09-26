import {
  SOCIAL_ACTIVITY_BARRIER_CATEGORIES,
  socialActivityBarrierLabel,
  type SocialActivityBarrierCategory,
} from '@bunshin/capability-social';
import type { PrismaClient } from '@prisma/client';

export type SocialActivityBarrierServiceSummary = {
  cases: {
    suspected: number;
    confirmed: number;
    resolved: number;
    dismissed: number;
  };
  support: {
    offered: number;
    accepted: number;
    completed: number;
    skipped: number;
  };
  confirmedCategories: Array<{
    category: SocialActivityBarrierCategory;
    label: string;
    count: number;
  }>;
};

export async function getSocialActivityBarrierServiceSummary(
  client: PrismaClient,
  input: { workspaceId: string; groupId: string },
): Promise<SocialActivityBarrierServiceSummary> {
  const cases = await client.socialActivityBarrierCase.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      groupMembership: { status: 'ACTIVE' },
    },
    select: {
      category: true,
      status: true,
      supportActions: { select: { status: true } },
    },
  });
  const caseCounts = { suspected: 0, confirmed: 0, resolved: 0, dismissed: 0 };
  const supportCounts = { offered: 0, accepted: 0, completed: 0, skipped: 0 };
  const categoryCounts = new Map<SocialActivityBarrierCategory, number>();
  for (const item of cases) {
    caseCounts[item.status.toLowerCase() as keyof typeof caseCounts] += 1;
    if (item.status === 'CONFIRMED')
      categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    for (const support of item.supportActions)
      supportCounts[support.status.toLowerCase() as keyof typeof supportCounts] += 1;
  }
  return {
    cases: caseCounts,
    support: supportCounts,
    confirmedCategories: SOCIAL_ACTIVITY_BARRIER_CATEGORIES.flatMap((category) => {
      const count = categoryCounts.get(category) ?? 0;
      return count > 0 ? [{ category, label: socialActivityBarrierLabel(category), count }] : [];
    }).sort((left, right) => right.count - left.count),
  };
}
