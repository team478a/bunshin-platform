import type { Prisma, PrismaClient } from './client';

type Client = PrismaClient | Prisma.TransactionClient;

export async function canManageServiceLineBroadcast(
  client: Client,
  input: { workspaceId: string; groupId: string; actorUserId: string },
) {
  return client.groupMembership.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      userId: input.actorUserId,
      status: 'ACTIVE',
      serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
      group: {
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        serviceConfiguration: { isNot: null },
      },
    },
    select: { id: true },
  });
}
