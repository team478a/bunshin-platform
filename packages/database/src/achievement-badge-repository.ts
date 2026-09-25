import type { AchievementBadge, AchievementBadgeRepository } from '@bunshin/capability-social';
import { type Prisma, type PrismaClient, prisma } from './client';

function achievementBadge(row: Prisma.AchievementBadgeGetPayload<object>): AchievementBadge {
  return row;
}

export class PrismaAchievementBadgeRepository implements AchievementBadgeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async authorized(input: { workspaceId: string; userId: string; bunshinId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.userId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }

  async list(input: Parameters<AchievementBadgeRepository['list']>[0]) {
    if (!(await this.authorized(input))) return null;
    return (
      await this.client.achievementBadge.findMany({
        where: input,
        orderBy: [{ awardedAt: 'asc' }, { id: 'asc' }],
      })
    ).map(achievementBadge);
  }

  async award(input: Parameters<AchievementBadgeRepository['award']>[0]) {
    if (!(await this.authorized(input))) return null;
    return achievementBadge(
      await this.client.achievementBadge.upsert({
        where: {
          workspaceId_userId_bunshinId_featureKey_badgeKey_ruleVersion: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            bunshinId: input.bunshinId,
            featureKey: input.featureKey,
            badgeKey: input.badgeKey,
            ruleVersion: input.ruleVersion,
          },
        },
        create: input,
        update: {},
      }),
    );
  }
}
