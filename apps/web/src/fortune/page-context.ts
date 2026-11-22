import 'server-only';
import { notFound } from 'next/navigation';
import { resolveAuthenticatedMemberServicePage } from '../services/member-service-page';

export async function resolveFortunePage(serviceSlug: string, returnTo: string) {
  const page = await resolveAuthenticatedMemberServicePage(serviceSlug, returnTo);
  const db = await import('@bunshin/database');
  const setting = await db.prisma.fortuneServiceSetting.findFirst({
    where: {
      workspaceId: page.service.workspaceId,
      groupId: page.service.serviceId,
      enabled: true,
      bunshin: {
        status: 'ACTIVE',
        capabilityAssignments: { some: { capabilityType: 'FORTUNE', status: 'ACTIVE' } },
      },
    },
    select: {
      commerceProduct: { select: { enabled: true } },
      minimumAge: true,
      followUpCreditEnabled: true,
      historyRetentionDays: true,
      weeklyNotificationEnabled: true,
      aiEnabled: true,
      personalProfileEnabled: true,
      reflectionEnabled: true,
      guidanceSettings: true,
      weeklyNotificationDay: true,
      weeklyNotificationHour: true,
    },
  });
  if (!setting) notFound();
  return { ...page, setting };
}
