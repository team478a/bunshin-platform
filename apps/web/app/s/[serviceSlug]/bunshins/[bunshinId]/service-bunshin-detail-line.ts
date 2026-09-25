import { currentLineEnvironment } from '../../../../../src/line/secure-configuration';
import type { PrismaClient } from '@bunshin/database';

type DatabaseModule = { prisma: PrismaClient };

export async function loadServiceDedicatedLineConnection(input: {
  db: DatabaseModule;
  workspaceId: string;
  groupId: string;
  actorUserId: string;
}) {
  const environment = currentLineEnvironment();
  const dedicatedLine = await input.db.prisma.groupLineChannelConfiguration.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      environment,
      status: 'ACTIVE',
      lastVerifiedAt: { not: null },
      lastErrorCategory: null,
      group: {
        lineRoutingPolicies: {
          some: { environment, mode: 'DEDICATED', pilotEnabled: true },
        },
      },
    },
    select: { id: true },
  });
  const dedicatedLineConnection = dedicatedLine
    ? await input.db.prisma.groupLineConnection.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          configurationId: dedicatedLine.id,
          userId: input.actorUserId,
          status: 'ACTIVE',
          friendshipStatus: 'FOLLOWING',
          notificationConsentAt: { not: null },
          groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
        },
        select: { id: true },
      })
    : null;

  return { dedicatedLine, dedicatedLineConnection };
}
