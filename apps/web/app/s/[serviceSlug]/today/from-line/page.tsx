import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { FORTUNE_WEEKLY_NOTIFICATION_TOPIC, toJapanLocalDate } from '@bunshin/capability-fortune';
import { resolveFortunePage } from '../../../../../src/fortune/page-context';
import { fortuneWeeklyLinePath } from '../../../../../src/fortune/weekly-line-delivery';

export const dynamic = 'force-dynamic';

export default async function FortuneWeeklyLineEntry({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const { actor, service, setting } = await resolveFortunePage(
    serviceSlug,
    fortuneWeeklyLinePath(serviceSlug),
  );
  if (setting.weeklyNotificationEnabled) {
    try {
      const { prisma } = await import('@bunshin/database');
      const preference = await prisma.serviceNotificationPreference.findFirst({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          userId: actor.userId,
          channel: 'LINE',
          topic: FORTUNE_WEEKLY_NOTIFICATION_TOPIC,
          enabled: true,
          consentedAt: { not: null },
          optedOutAt: null,
          groupMembership: {
            status: 'ACTIVE',
            consentedAt: { not: null },
            fortuneParticipation: { isNot: null },
          },
        },
        select: { groupMembershipId: true },
      });
      if (preference) {
        const now = new Date();
        await prisma.serviceMembershipEvent.createMany({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            groupMembershipId: preference.groupMembershipId,
            userId: actor.userId,
            eventType: 'FORTUNE_WEEKLY_LINE_RETURN',
            channel: 'LINE',
            topic: FORTUNE_WEEKLY_NOTIFICATION_TOPIC,
            idempotencyKey: `fortune-line-return:${preference.groupMembershipId}:${toJapanLocalDate(now)}`,
            occurredAt: now,
          },
          skipDuplicates: true,
        });
      }
    } catch {
      console.warn('Fortune weekly LINE return metric could not be recorded.');
    }
  }
  redirect(`/s/${serviceSlug}/today` as Route);
}
