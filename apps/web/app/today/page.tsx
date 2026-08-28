import { ConsumeMissionDeepLinkState } from '@bunshin/application';
import { RecordMissionActivity } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../src/auth/current-user';
import { missionReturnPath } from '../../src/auth/line-return';
import { HkdfMissionDeepLinkSigner } from '../../src/line/mission-deep-link-signer';
import { currentLineEnvironment } from '../../src/line/secure-configuration';

export const dynamic = 'force-dynamic';

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const token = (await searchParams).state;
  const returnPath = token ? missionReturnPath(token) : null;
  if (!token || !returnPath) notFound();
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(returnPath)}`);
  const db = await import('@bunshin/database');
  try {
    const state = await new ConsumeMissionDeepLinkState(
      new db.PrismaMissionDeepLinkStateRepository(),
      new HkdfMissionDeepLinkSigner(),
    ).execute({ token, environment: currentLineEnvironment(), actorUserId: user.userId });
    await new RecordMissionActivity(
      new db.PrismaDailyMissionRepository(),
      new db.PrismaBunshinCapabilityAssignmentRepository(),
      new db.PrismaMissionEngagementRepository(),
    ).execute({
      workspaceId: state.workspaceId,
      actorUserId: user.userId,
      bunshinId: state.bunshinId,
      dailyMissionId: state.dailyMissionId,
      type: 'VIEWED',
      idempotencyKey: `line-deep-link:${state.id}`,
      metadata: null,
    });
    const mission = await db.prisma.dailyMission.findFirst({
      where: {
        id: state.dailyMissionId,
        workspaceId: state.workspaceId,
        bunshinId: state.bunshinId,
        bunshin: { ownerUserId: user.userId, status: { not: 'ARCHIVED' } },
      },
      select: {
        format: true,
        campaign: { select: { groupId: true } },
        contentLinkUsage: { select: { groupId: true } },
      },
    });
    if (mission && ['IMAGE', 'SLIDE'].includes(mission.format)) {
      const now = new Date();
      const preferredGroupId = mission.contentLinkUsage?.groupId ?? mission.campaign?.groupId;
      const memberships = await db.prisma.groupMembership.findMany({
        where: {
          workspaceId: state.workspaceId,
          userId: user.userId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          ...(preferredGroupId ? { groupId: preferredGroupId } : {}),
          group: {
            status: 'ACTIVE',
            featurePolicies: {
              some: {
                featureKey: 'SOCIAL.IMAGE_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              },
            },
          },
          featureAssignments: {
            some: {
              featureKey: 'SOCIAL.IMAGE_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
        select: { id: true },
      });
      const enrollment = memberships.length
        ? await db.prisma.socialImagePilotEnrollment.findFirst({
            where: {
              workspaceId: state.workspaceId,
              groupMembershipId: { in: memberships.map(({ id }) => id) },
              status: 'ACTIVE',
              revokedAt: null,
              pilot: {
                status: 'ACTIVE',
                emergencyStop: false,
                OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              },
            },
            select: { groupId: true },
            orderBy: { createdAt: 'asc' },
          })
        : null;
      if (enrollment)
        redirect(
          `/groups/${enrollment.groupId}/images?mission=${encodeURIComponent(state.dailyMissionId)}`,
        );
    }
    redirect(`/bunshins/${state.bunshinId}#daily-mission`);
  } catch (error) {
    if (error instanceof ApplicationError) notFound();
    throw error;
  }
}
