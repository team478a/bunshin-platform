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
    select: { minimumAge: true, historyRetentionDays: true, weeklyNotificationEnabled: true },
  });
  if (!setting) notFound();
  return { ...page, setting };
}
