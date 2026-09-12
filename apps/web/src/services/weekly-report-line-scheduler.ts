import 'server-only';
import { EnqueueJob, type JobEnvironment } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { loadServiceWeeklyProgressReports } from './weekly-progress-report-data';
import { currentMonday, previousWeek, resolveWeeklyReportWindow } from './weekly-progress-report';
import {
  buildWeeklyReportLineMessage,
  isWeeklyReportDeliveryDue,
  readWeeklyReportDeliverySetting,
} from './weekly-report-line-delivery';

export type WeeklyReportLineScheduleSummary = {
  services: number;
  due: number;
  broadcasts: number;
  recipients: number;
  skipped: number;
  failures: number;
};

export async function scheduleWeeklyReportLineDeliveries(input: {
  environment: JobEnvironment;
  now?: Date;
}): Promise<WeeklyReportLineScheduleSummary> {
  const db = await import('@bunshin/database');
  const now = input.now ?? new Date();
  const timezone = 'Asia/Tokyo';
  const summary: WeeklyReportLineScheduleSummary = {
    services: 0,
    due: 0,
    broadcasts: 0,
    recipients: 0,
    skipped: 0,
    failures: 0,
  };
  const services = await db.prisma.serviceConfiguration.findMany({
    where: {
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      registration: { is: { lineEnabled: true } },
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    select: {
      workspaceId: true,
      groupId: true,
      slug: true,
      displayName: true,
      registration: { select: { onboardingConfig: true } },
    },
    orderBy: { id: 'asc' },
    take: 500,
  });
  summary.services = services.length;
  const weekStart = previousWeek(currentMonday(now, timezone));
  const window = resolveWeeklyReportWindow(weekStart, now, timezone);

  for (const service of services) {
    const setting = readWeeklyReportDeliverySetting(service.registration?.onboardingConfig);
    if (!isWeeklyReportDeliveryDue({ setting, now, timezone })) continue;
    summary.due += 1;
    try {
      const automationKey = `weekly-report:${input.environment}:${service.groupId}:${window.weekStart}`;
      const existing = await db.prisma.serviceLineBroadcast.findUnique({
        where: { automationKey },
        select: { id: true, status: true, updatedByUserId: true },
      });
      if (existing) {
        if (existing.status === 'SCHEDULED') {
          await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
            environment: input.environment,
            workspaceId: service.workspaceId,
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
      const configuration = await db.prisma.groupLineChannelConfiguration.findFirst({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.groupId,
          environment: input.environment,
          status: 'ACTIVE',
          lastVerifiedAt: { not: null },
          lastErrorCategory: null,
          globallyPaused: false,
        },
        select: { id: true },
      });
      if (!configuration) {
        summary.skipped += 1;
        continue;
      }
      const [actor, connections, reports] = await Promise.all([
        db.prisma.groupMembership.findFirst({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.groupId,
            status: 'ACTIVE',
            serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
            user: { status: 'ACTIVE' },
          },
          orderBy: { createdAt: 'asc' },
          select: { userId: true },
        }),
        db.prisma.groupLineConnection.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.groupId,
            configurationId: configuration.id,
            status: 'ACTIVE',
            notificationConsentAt: { not: null },
            friendshipStatus: 'FOLLOWING',
            groupMembership: {
              status: 'ACTIVE',
              consentedAt: { not: null },
              serviceRole: 'PARTICIPANT',
            },
            user: { status: 'ACTIVE' },
          },
          select: { groupMembershipId: true, userId: true },
          take: 500,
        }),
        loadServiceWeeklyProgressReports({
          client: db.prisma,
          workspaceId: service.workspaceId,
          groupId: service.groupId,
          window,
          asOf: now,
        }),
      ]);
      if (!actor || !connections.length) {
        summary.skipped += 1;
        continue;
      }
      const reportsByUserId = new Map(reports.map((report) => [report.userId, report]));
      const reportUrl = new URL(
        `/s/${encodeURIComponent(service.slug)}/weekly-report?week=${window.weekStart}`,
        getServerEnvironment().APP_URL,
      ).toString();
      const recipients = connections.flatMap((connection) => {
        const report = reportsByUserId.get(connection.userId);
        return report
          ? [
              {
                ...connection,
                message: buildWeeklyReportLineMessage({
                  serviceName: service.displayName,
                  headline: report.headline,
                  nextStep: report.nextStep,
                  reportUrl,
                  pointExpiry:
                    report.expiringPoints > 0 && report.nextPointExpiryAt
                      ? {
                          amount: report.expiringPoints,
                          dateLabel: new Intl.DateTimeFormat('ja-JP', {
                            timeZone: timezone,
                            month: 'long',
                            day: 'numeric',
                          }).format(report.nextPointExpiryAt),
                        }
                      : null,
                }),
              },
            ]
          : [];
      });
      if (!recipients.length) {
        summary.skipped += 1;
        continue;
      }
      const broadcast = await db.prisma.$transaction(async (tx) => {
        const row = await tx.serviceLineBroadcast.upsert({
          where: { automationKey },
          create: {
            workspaceId: service.workspaceId,
            groupId: service.groupId,
            title: `週次レポート ${window.weekStart}`,
            message: `${service.displayName}の1週間のふり返りができました。`,
            automationKey,
            segmentCriteria: { kind: 'WEEKLY_REPORT', weekStart: window.weekStart },
            status: 'SCHEDULED',
            scheduledAt: now,
            createdByUserId: actor.userId,
            updatedByUserId: actor.userId,
          },
          update: {},
        });
        const inserted = await tx.serviceLineBroadcastRecipient.createMany({
          data: recipients.map((recipient) => ({
            workspaceId: service.workspaceId,
            groupId: service.groupId,
            broadcastId: row.id,
            groupMembershipId: recipient.groupMembershipId,
            userId: recipient.userId,
            message: recipient.message,
          })),
          skipDuplicates: true,
        });
        if (inserted.count > 0) {
          await tx.serviceLineBroadcastAuditLog.create({
            data: {
              workspaceId: service.workspaceId,
              groupId: service.groupId,
              broadcastId: row.id,
              action: 'AUTO_SCHEDULED',
              beforeData: {},
              afterData: {
                recipients: inserted.count,
                environment: input.environment,
                weekStart: window.weekStart,
              },
              reason: 'サービス管理者が有効にした週次レポートを自動配信',
              performedByUserId: actor.userId,
            },
          });
        }
        return { row, inserted: inserted.count };
      });
      await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
        environment: input.environment,
        workspaceId: service.workspaceId,
        correlationId: automationKey,
        requestedBy: actor.userId,
        jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
        payloadReference: `service-line-broadcast:${broadcast.row.id}`,
        idempotencyKey: `${automationKey}:deliver`,
        priority: 45,
        maxAttempts: 3,
        scheduledAt: now,
      });
      if (broadcast.inserted > 0) {
        summary.broadcasts += 1;
        summary.recipients += broadcast.inserted;
      }
    } catch {
      summary.failures += 1;
    }
  }
  return summary;
}
