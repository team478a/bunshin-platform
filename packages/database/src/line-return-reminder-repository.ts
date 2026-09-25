import type { LineReturnReminderRepository } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';

export class PrismaLineReturnReminderRepository implements LineReturnReminderRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async shouldUse(input: Parameters<LineReturnReminderRepository['shouldUse']>[0]) {
    const localDate = new Date(`${input.localDate}T00:00:00.000Z`);
    if (Number.isNaN(localDate.valueOf())) return false;
    const dormantBefore = new Date(localDate);
    dormantBefore.setUTCDate(dormantBefore.getUTCDate() - input.dormancyDays);
    const cooldownFrom = new Date(localDate);
    cooldownFrom.setUTCDate(cooldownFrom.getUTCDate() - input.cooldownDays);
    const preference = await this.client.lineNotificationPreference.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        userId: input.actorUserId,
        enabled: true,
        reminderEnabled: true,
        notificationConsentAt: { not: null },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
        bunshin: { status: { not: 'ARCHIVED' } },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!preference) return false;
    const [lastActivity, recentReminder] = await Promise.all([
      this.client.missionActivity.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          actorUserId: input.actorUserId,
        },
        select: { dailyMission: { select: { missionDate: true } } },
        orderBy: [{ dailyMission: { missionDate: 'desc' } }, { occurredAt: 'desc' }],
      }),
      this.client.lineMessageDelivery.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          userId: input.actorUserId,
          kind: 'REMINDER',
          createdAt: { gte: cooldownFrom },
          status: { in: ['PENDING', 'PROCESSING', 'SENT'] },
        },
        select: { id: true },
      }),
    ]);
    return Boolean(
      lastActivity && lastActivity.dailyMission.missionDate <= dormantBefore && !recentReminder,
    );
  }
}
