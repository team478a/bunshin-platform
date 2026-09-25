import type { PrismaClient } from '@bunshin/database';

type DatabaseModule = { prisma: PrismaClient };

export async function loadServiceBunshinSocialInsights(input: {
  db: DatabaseModule;
  enabled: boolean;
  workspaceId: string;
  groupId: string;
  actorUserId: string;
  bunshinId: string;
}) {
  if (!input.enabled) return [];
  return input.db.prisma.socialInsightSnapshot.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      userId: input.actorUserId,
      bunshinId: input.bunshinId,
    },
    orderBy: [{ observedOn: 'desc' }, { updatedAt: 'desc' }],
    take: 12,
  });
}
