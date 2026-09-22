import type {
  LineNotificationPreference,
  LineNotificationPreferenceRepository,
} from '@bunshin/application';
import { type Prisma, type PrismaClient, prisma } from './client';

function lineNotificationPreference(
  row: Prisma.LineNotificationPreferenceGetPayload<object>,
): LineNotificationPreference {
  return row;
}

export class PrismaLineNotificationPreferenceRepository implements LineNotificationPreferenceRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private accessible(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }

  async getScoped(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    if (!(await this.accessible(input))) return { accessible: false, preference: null };
    const row = await this.client.lineNotificationPreference.findUnique({
      where: {
        workspaceId_userId_bunshinId: {
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          bunshinId: input.bunshinId,
        },
      },
    });
    return { accessible: true, preference: row ? lineNotificationPreference(row) : null };
  }

  async upsert(input: Parameters<LineNotificationPreferenceRepository['upsert']>[0]) {
    if (!(await this.accessible(input))) return null;
    return this.client.$transaction(async (tx) => {
      const existing = await tx.lineNotificationPreference.findUnique({
        where: {
          workspaceId_userId_bunshinId: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            bunshinId: input.bunshinId,
          },
        },
      });
      const consentAt = input.consentGranted
        ? (existing?.notificationConsentAt ?? new Date())
        : null;
      const data = {
        enabled: input.enabled,
        notificationConsentAt: consentAt,
        localTime: input.localTime,
        timezone: input.timezone,
        frequency: input.frequency,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd,
        pausedUntil: input.pausedUntil,
        reminderEnabled: input.reminderEnabled,
      };
      const row = await tx.lineNotificationPreference.upsert({
        where: {
          workspaceId_userId_bunshinId: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            bunshinId: input.bunshinId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          bunshinId: input.bunshinId,
          ...data,
        },
        update: data,
      });
      return lineNotificationPreference(row);
    });
  }
}
