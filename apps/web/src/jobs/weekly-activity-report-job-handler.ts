import 'server-only';

import {
  GetWeeklyActivityReport,
  weeklyActivityLineText,
  type WeeklyActivityReportJobHandler,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ActiveLineDeliveryConfigurationAdapter } from '../line/delivery-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';

export function createWeeklyActivityReportJobHandler(): WeeklyActivityReportJobHandler {
  return {
    async execute({ job, weekStart }) {
      if (!job.bunshinId)
        return { status: 'CANCELLED', category: 'RECIPIENT_UNAVAILABLE', retryable: false };
      const db = await import('@bunshin/database');
      const [preferenceResult, target] = await Promise.all([
        new db.PrismaLineNotificationPreferenceRepository().getScoped({
          workspaceId: job.workspaceId,
          bunshinId: job.bunshinId,
          actorUserId: job.requestedBy,
        }),
        db.prisma.bunshin.findFirst({
          where: {
            id: job.bunshinId,
            workspaceId: job.workspaceId,
            ownerUserId: job.requestedBy,
            status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
            group: {
              status: 'ACTIVE',
              memberships: {
                some: {
                  userId: job.requestedBy,
                  status: 'ACTIVE',
                  consentedAt: { not: null },
                },
              },
              serviceConfiguration: { isNot: null },
            },
          },
          select: {
            groupId: true,
            group: { select: { serviceConfiguration: { select: { slug: true } } } },
          },
        }),
      ]);
      const preference = preferenceResult.preference;
      const groupId = target?.groupId;
      const slug = target?.group?.serviceConfiguration?.slug;
      if (
        !preferenceResult.accessible ||
        !preference?.enabled ||
        !preference.notificationConsentAt ||
        !groupId ||
        !slug
      )
        return { status: 'CANCELLED', category: 'NOTIFICATION_SUPPRESSED', retryable: false };
      const recipient = await new db.PrismaLineConnectionRepository().resolve({
        environment: job.environment,
        workspaceId: job.workspaceId,
        groupId,
        bunshinId: job.bunshinId,
        userId: job.requestedBy,
      });
      if (!recipient)
        return { status: 'CANCELLED', category: 'RECIPIENT_UNAVAILABLE', retryable: false };
      const configuration = await new ActiveLineDeliveryConfigurationAdapter().getActive(
        job.environment,
        { workspaceId: job.workspaceId, groupId, userId: job.requestedBy },
      );
      if (!configuration)
        return { status: 'FAILED', category: 'CONFIGURATION_UNAVAILABLE', retryable: true };
      if (configuration.globallyPaused)
        return { status: 'CANCELLED', category: 'GLOBALLY_PAUSED', retryable: false };
      const provider = new LineMessagingApiAdapter();
      const quota = await provider.getQuota(configuration.accessToken);
      if (!quota.ok)
        return { status: 'FAILED', category: quota.category, retryable: quota.retryable };
      if (quota.limit !== null && quota.consumption >= quota.limit)
        return { status: 'FAILED', category: 'QUOTA_EXHAUSTED', retryable: true };
      if (
        quota.limit !== null &&
        (quota.consumption / quota.limit) * 100 >= configuration.quotaLowPriorityStop
      )
        return { status: 'CANCELLED', category: 'QUOTA_LOW_PRIORITY_STOP', retryable: false };
      const report = await new GetWeeklyActivityReport(
        new db.PrismaWeeklyActivityReportRepository(),
      ).execute({
        workspaceId: job.workspaceId,
        groupId,
        bunshinId: job.bunshinId,
        actorUserId: job.requestedBy,
        timezone: preference.timezone,
        weekStart,
      });
      const base = new URL(getServerEnvironment().APP_URL);
      if (job.environment === 'PRODUCTION' && base.protocol !== 'https:')
        return { status: 'FAILED', category: 'CONFIGURATION_UNAVAILABLE', retryable: false };
      // weeklyActivityLineText intentionally rejects non-HTTPS links. Production is the
      // only environment that sends this scheduled member notification.
      if (base.protocol !== 'https:')
        return { status: 'CANCELLED', category: 'NOTIFICATION_SUPPRESSED', retryable: false };
      const deepLink = new URL(
        `/s/${encodeURIComponent(slug)}/bunshins/${encodeURIComponent(job.bunshinId)}`,
        base,
      );
      deepLink.searchParams.set('weekStart', weekStart);
      const result = await provider.pushText({
        accessToken: configuration.accessToken,
        recipientId: recipient,
        text: weeklyActivityLineText(report, deepLink.toString()),
      });
      return result.ok
        ? { status: 'SENT' }
        : { status: 'FAILED', category: result.category, retryable: result.retryable };
    },
  };
}
