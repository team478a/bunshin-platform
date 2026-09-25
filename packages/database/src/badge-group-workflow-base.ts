import type { PrismaClient } from '@prisma/client';

export abstract class PrismaBadgeGroupWorkflowBase {
  constructor(protected readonly client: PrismaClient) {}

  protected manager(workspaceId: string, groupId: string, userId: string) {
    return this.client.groupMembership.findFirst({
      where: {
        workspaceId,
        groupId,
        userId,
        role: 'MANAGER',
        status: 'ACTIVE',
        group: { status: 'ACTIVE' },
        workspace: { memberships: { some: { userId, status: 'ACTIVE' } } },
      },
      select: { id: true },
    });
  }
}
