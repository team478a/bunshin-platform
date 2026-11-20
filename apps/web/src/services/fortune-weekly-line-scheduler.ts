import 'server-only';
import { EnqueueJob, type JobEnvironment } from '@bunshin/application';
import { FORTUNE_WEEKLY_NOTIFICATION_TOPIC } from '@bunshin/capability-fortune';
import { getServerEnvironment } from '@bunshin/config';
import {
  buildFortuneWeeklyLineMessage,
  fortuneWeeklyLocalSlot,
  fortuneWeeklyLinePath,
  isFortuneWeeklyNotificationDue,
} from '../fortune/weekly-line-delivery';

export type FortuneWeeklyLineScheduleSummary = {
  services: number;
  due: number;
  broadcasts: number;
  recipients: number;
  skipped: number;
  failures: number;
};

export async function scheduleFortuneWeeklyLineDeliveries(input: {
  environment: JobEnvironment;
  now?: Date;
}): Promise<FortuneWeeklyLineScheduleSummary> {
  const db = await import('@bunshin/database');
  const now = input.now ?? new Date();
  const summary: FortuneWeeklyLineScheduleSummary = {
    services: 0,
    due: 0,
    broadcasts: 0,
    recipients: 0,
    skipped: 0,
    failures: 0,
  };
  const settings = await db.prisma.fortuneServiceSetting.findMany({
    where: {
      enabled: true,
      weeklyNotificationEnabled: true,
      bunshin: {
        status: 'ACTIVE',
        capabilityAssignments: { some: { capabilityType: 'FORTUNE', status: 'ACTIVE' } },
      },
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      configuration: {
        registration: { is: { lineEnabled: true } },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
    },
    select: {
      id: true,
      workspaceId: true,
      groupId: true,
      timeZone: true,
      weeklyNotificationDay: true,
      weeklyNotificationHour: true,
      personalProfileEnabled: true,
      configuration: { select: { slug: true, displayName: true } },
    },
    orderBy: { id: 'asc' },
    take: 500,
  });
  summary.services = settings.length;

  for (const setting of settings) {
    const defaultDue = isFortuneWeeklyNotificationDue({
      now,
      timeZone: setting.timeZone,
      weekday: setting.weeklyNotificationDay,
      hour: setting.weeklyNotificationHour,
    });
    if (!setting.personalProfileEnabled && !defaultDue) continue;
    try {
      const slot = fortuneWeeklyLocalSlot(now, setting.timeZone);
      const deliveryDate = slot.date;
      const prefix = `fortune-weekly:${input.environment}:${setting.groupId}:`;
      const automationKey = `${prefix}${deliveryDate}${setting.personalProfileEnabled ? `:${slot.hour.toString().padStart(2, '0')}` : ''}`;
      const existing = await db.prisma.serviceLineBroadcast.findUnique({
        where: { automationKey },
        select: { id: true, status: true, updatedByUserId: true },
      });
      if (existing) {
        summary.due += 1;
        if (existing.status === 'SCHEDULED') {
          await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
            environment: input.environment,
            workspaceId: setting.workspaceId,
            correlationId: automationKey,
            requestedBy: existing.updatedByUserId,
            jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
            payloadReference: `service-line-broadcast:${existing.id}`,
            idempotencyKey: `${automationKey}:deliver`,
            priority: 45,
            maxAttempts: 3,
            scheduledAt: now,
          });
        }
        summary.skipped += 1;
        continue;
      }
      const reservations = {
        workspaceId: setting.workspaceId,
        groupId: setting.groupId,
        broadcast: {
          automationKey: {
            startsWith: prefix,
            gte: `${prefix}${slot.weekStart}`,
            lte: `${prefix}${deliveryDate}z`,
          },
        },
      };
      const scheduledThisWeek = await db.prisma.serviceLineBroadcastRecipient.findMany({
        where: reservations,
        distinct: ['groupMembershipId'],
        select: { groupMembershipId: true },
      });
      const [actor, preferences] = await Promise.all([
        db.prisma.groupMembership.findFirst({
          where: {
            workspaceId: setting.workspaceId,
            groupId: setting.groupId,
            status: 'ACTIVE',
            serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
            user: { status: 'ACTIVE' },
          },
          orderBy: { createdAt: 'asc' },
          select: { userId: true },
        }),
        db.prisma.serviceNotificationPreference.findMany({
          where: {
            workspaceId: setting.workspaceId,
            groupId: setting.groupId,
            topic: FORTUNE_WEEKLY_NOTIFICATION_TOPIC,
            channel: 'LINE',
            enabled: true,
            consentedAt: { not: null },
            optedOutAt: null,
            ...(scheduledThisWeek.length
              ? {
                  groupMembershipId: {
                    notIn: scheduledThisWeek.map((row) => row.groupMembershipId),
                  },
                }
              : {}),
            groupMembership: {
              status: 'ACTIVE',
              consentedAt: { not: null },
              serviceRole: 'PARTICIPANT',
              fortuneParticipation: {
                is: {
                  serviceSettingId: setting.id,
                  ...(setting.personalProfileEnabled
                    ? {
                        OR: [
                          {
                            notificationWeekday: slot.weekday,
                            notificationHour: { lte: slot.hour },
                          },
                          ...(defaultDue ? [{ notificationWeekday: null }] : []),
                        ],
                      }
                    : {}),
                },
              },
            },
            user: { status: 'ACTIVE' },
          },
          select: { groupMembershipId: true, userId: true },
          take: 500,
        }),
      ]);
      if (defaultDue || preferences.length > 0) summary.due += 1;
      if (!actor || !preferences.length) {
        if (defaultDue || preferences.length > 0) summary.skipped += 1;
        continue;
      }
      const serviceUrl = new URL(
        fortuneWeeklyLinePath(setting.configuration.slug),
        getServerEnvironment().APP_URL,
      ).toString();
      const message = buildFortuneWeeklyLineMessage({
        serviceName: setting.configuration.displayName,
        serviceUrl,
      });
      const broadcast = await db.prisma.$transaction(async (tx) => {
        // Serialize reservation across overlapping scheduler runs and different slots of this service.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${prefix + slot.weekStart}, 0))`;
        const alreadyReserved = await tx.serviceLineBroadcastRecipient.findMany({
          where: {
            ...reservations,
            groupMembershipId: { in: preferences.map((row) => row.groupMembershipId) },
          },
          select: { groupMembershipId: true },
        });
        const reserved = new Set(alreadyReserved.map((row) => row.groupMembershipId));
        const recipients = preferences.filter(
          (preference) => !reserved.has(preference.groupMembershipId),
        );
        if (!recipients.length) return null;
        const row = await tx.serviceLineBroadcast.create({
          data: {
            workspaceId: setting.workspaceId,
            groupId: setting.groupId,
            title: `週次占いのお知らせ ${deliveryDate}`,
            message,
            automationKey,
            segmentCriteria: {
              kind: 'FORTUNE_WEEKLY',
              topic: FORTUNE_WEEKLY_NOTIFICATION_TOPIC,
              deliveryDate,
            },
            status: 'SCHEDULED',
            scheduledAt: now,
            createdByUserId: actor.userId,
            updatedByUserId: actor.userId,
          },
        });
        const inserted = await tx.serviceLineBroadcastRecipient.createMany({
          data: recipients.map((preference) => ({
            workspaceId: setting.workspaceId,
            groupId: setting.groupId,
            broadcastId: row.id,
            groupMembershipId: preference.groupMembershipId,
            userId: preference.userId,
          })),
          skipDuplicates: true,
        });
        await tx.serviceLineBroadcastAuditLog.create({
          data: {
            workspaceId: setting.workspaceId,
            groupId: setting.groupId,
            broadcastId: row.id,
            action: 'AUTO_SCHEDULED',
            beforeData: {},
            afterData: {
              recipients: inserted.count,
              environment: input.environment,
              deliveryDate,
              topic: FORTUNE_WEEKLY_NOTIFICATION_TOPIC,
            },
            reason: '本人が希望した週次占いのお知らせを自動配信',
            performedByUserId: actor.userId,
          },
        });
        return { id: row.id, recipients: inserted.count };
      });
      if (!broadcast) {
        summary.skipped += 1;
        continue;
      }
      await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
        environment: input.environment,
        workspaceId: setting.workspaceId,
        correlationId: automationKey,
        requestedBy: actor.userId,
        jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
        payloadReference: `service-line-broadcast:${broadcast.id}`,
        idempotencyKey: `${automationKey}:deliver`,
        priority: 45,
        maxAttempts: 3,
        scheduledAt: now,
      });
      summary.broadcasts += 1;
      summary.recipients += broadcast.recipients;
    } catch {
      summary.failures += 1;
    }
  }
  return summary;
}
