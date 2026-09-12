import { RecordMissionActivity } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { localDateInTimezone } from '../../../../src/activity-progress';
import { isRouteNotFound } from '../../../../src/navigation/route-not-found';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

const pointsPath = (serviceSlug: string) =>
  `/points?serviceSlug=${encodeURIComponent(serviceSlug)}` as Route;

export default async function OpenMissionForPointsPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceSlug?: string }>;
}) {
  const serviceSlug = (await searchParams).serviceSlug?.trim();
  if (!serviceSlug) notFound();

  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/points/open-mission?serviceSlug=${serviceSlug}`)}` as Route,
    );

  let service;
  try {
    service = await resolvePublicServiceContext(serviceSlug);
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }

  const db = await import('@bunshin/database');
  const pilot = await db.getActiveRewardsPilotAccess(db.prisma, {
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    userId: user.userId,
  });
  if (!pilot) redirect(pointsPath(service.configuration.slug));

  const mission = await db.prisma.dailyMission.findFirst({
    where: {
      workspaceId: service.workspaceId,
      bunshin: {
        ownerUserId: user.userId,
        groupId: service.serviceId,
        status: { not: 'ARCHIVED' },
      },
    },
    select: { id: true, bunshinId: true },
    orderBy: [{ missionDate: 'desc' }, { createdAt: 'desc' }],
  });
  if (!mission) redirect(`/s/${encodeURIComponent(service.configuration.slug)}/bunshins` as Route);

  try {
    await new RecordMissionActivity(
      new db.PrismaDailyMissionRepository(),
      new db.PrismaBunshinCapabilityAssignmentRepository(),
      new db.PrismaMissionEngagementRepository(),
    ).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: user.userId,
      bunshinId: mission.bunshinId,
      dailyMissionId: mission.id,
      type: 'VIEWED',
      idempotencyKey: `points-open:${mission.id}:${localDateInTimezone(new Date(), 'Asia/Tokyo')}`,
      metadata: null,
    });
  } catch (error) {
    if (
      !(error instanceof ApplicationError) ||
      (error.code !== 'NOT_FOUND' && error.code !== 'FORBIDDEN')
    )
      throw error;
  }

  redirect(
    `/s/${encodeURIComponent(service.configuration.slug)}/bunshins/${mission.bunshinId}#today-post` as Route,
  );
}
