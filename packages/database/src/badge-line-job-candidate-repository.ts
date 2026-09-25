import type { PrismaClient } from '@prisma/client';
import type { BadgeLineJobCandidateRepository } from '@bunshin/application';

export class PrismaBadgeLineJobCandidateRepository implements BadgeLineJobCandidateRepository {
  constructor(private readonly client: PrismaClient) {}

  async listPending(input: Parameters<BadgeLineJobCandidateRepository['listPending']>[0]) {
    const rows = await this.client.badgeLineNotificationDelivery.findMany({
      where: {
        environment: input.environment,
        status: 'PENDING',
        scheduledAt: { lte: new Date() },
        workspace: { status: 'ACTIVE' },
        group: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
      },
      orderBy: { scheduledAt: 'asc' },
      take: input.limit,
      select: { id: true, workspaceId: true, userId: true },
    });
    return rows.map((row) => ({
      deliveryId: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
    }));
  }
}
