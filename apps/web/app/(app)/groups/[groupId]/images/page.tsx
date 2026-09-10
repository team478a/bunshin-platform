import {
  GetPointUserDashboard,
  ListPointRewardCatalog,
  buildEditorialCarouselLayout,
  type EditorialCarouselSlideInput,
} from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { SocialImageWorkspace } from '../../../../ui/social-image-workspace';

export const dynamic = 'force-dynamic';

export default async function GroupImagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ mission?: string; service?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsedGroupId = z.uuid().safeParse((await params).groupId);
  if (!parsedGroupId.success) notFound();
  const db = await import('@bunshin/database');
  const now = new Date();
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      groupId: parsedGroupId.data,
      userId: actor.userId,
      status: 'ACTIVE',
      consentedAt: { not: null },
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { id: true, group: { select: { id: true, name: true, workspaceId: true } } },
  });
  if (!membership) notFound();

  const access = await new db.PrismaGroupFeatureEntitlementRepository().resolveAccess({
    workspaceId: membership.group.workspaceId,
    groupId: membership.group.id,
    actorUserId: actor.userId,
    featureKey: 'SOCIAL.IMAGE_GENERATION',
    now,
  });
  if (!access?.allowed) notFound();

  const missions = await db.prisma.dailyMission.findMany({
    where: {
      workspaceId: membership.group.workspaceId,
      bunshin: { ownerUserId: actor.userId, status: { not: 'ARCHIVED' } },
      format: { in: ['IMAGE', 'SLIDE'] },
      status: { notIn: ['EXPIRED', 'SKIPPED'] },
    },
    select: {
      id: true,
      bunshinId: true,
      topic: true,
      angle: true,
      format: true,
      campaignId: true,
      bunshin: { select: { name: true } },
      contentLinkUsage: { select: { groupId: true, productPackVersionId: true } },
      campaign: { select: { groupId: true, productPackVersionId: true } },
      content: { select: { contentJson: true } },
    },
    orderBy: { missionDate: 'desc' },
    take: 30,
  });
  const available = missions.filter(
    (mission) =>
      (!mission.campaignId || mission.campaign?.groupId === membership.group.id) &&
      (!mission.contentLinkUsage || mission.contentLinkUsage.groupId === membership.group.id),
  );
  const requests = await db.prisma.socialImageGenerationRequest.findMany({
    where: {
      groupId: membership.group.id,
      ownerUserId: actor.userId,
      dailyMissionId: { in: available.map((mission) => mission.id) },
    },
    select: { id: true, status: true, dailyMissionId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const brand = await db.prisma.serviceBrand.findFirst({
    where: { workspaceId: membership.group.workspaceId, groupId: membership.group.id },
    select: { primaryColor: true },
  });
  const creditAccount = await db.prisma.serviceCreditAccount.findFirst({
    where: {
      workspaceId: membership.group.workspaceId,
      groupId: membership.group.id,
      groupMembershipId: membership.id,
      userId: actor.userId,
    },
    select: { availableCredits: true },
  });
  const commercialSetting = await db.prisma.serviceCommercialSetting.findFirst({
    where: { workspaceId: membership.group.workspaceId, groupId: membership.group.id },
    select: {
      status: true,
      monthlyImageGenerationLimit: true,
      startsAt: true,
      endsAt: true,
    },
  });
  const servicePlanConfigured =
    commercialSetting !== null &&
    commercialSetting.status !== 'DRAFT' &&
    commercialSetting.monthlyImageGenerationLimit !== null;
  let servicePlanImageRemaining: number | null = null;
  if (servicePlanConfigured) {
    const servicePlanActive =
      commercialSetting.status === 'ACTIVE' &&
      (!commercialSetting.startsAt || commercialSetting.startsAt <= now) &&
      (!commercialSetting.endsAt || commercialSetting.endsAt > now);
    if (!servicePlanActive) {
      servicePlanImageRemaining = 0;
    } else {
      const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const used = await db.prisma.serviceMediaGenerationReservation.count({
        where: {
          workspaceId: membership.group.workspaceId,
          groupId: membership.group.id,
          kind: 'IMAGE',
          monthKey,
          OR: [{ status: 'CONSUMED' }, { status: 'RESERVED', expiresAt: { gt: now } }],
        },
      });
      servicePlanImageRemaining = Math.max(
        0,
        commercialSetting.monthlyImageGenerationLimit! - used,
      );
    }
  }
  const redemptions = new db.PrismaPointRedemptionRepository();
  let imagePointCost: number | null = null;
  let availablePoints = 0;
  try {
    const [catalog, pointDashboard] = await Promise.all([
      new ListPointRewardCatalog(redemptions).execute({
        workspaceId: membership.group.workspaceId,
        actorUserId: actor.userId,
        now,
      }),
      new GetPointUserDashboard(new db.PrismaPointLedgerRepository()).execute({
        workspaceId: membership.group.workspaceId,
        actorUserId: actor.userId,
        now,
        timezone: 'Asia/Tokyo',
      }),
    ]);
    imagePointCost =
      catalog.find((item) => item.rewardType === 'SOCIAL_IMAGE_GENERATION')?.pointCost ?? null;
    availablePoints = pointDashboard.account.availablePoints;
  } catch {
    // ポイント確認に失敗してもページ全体を壊さず、画像作成だけを停止する。
  }

  const query = await searchParams;
  const serviceHome = query.service ? `/s/${query.service}/home` : '/groups';
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">今日やること</p>
        <h1>投稿画像を作る</h1>
        <p>青い「画像を作る」ボタンを押すと、投稿用の画像ができあがります。</p>
        <a href={serviceHome}>← 戻る</a>
      </header>
      <SocialImageWorkspace
        workspaceId={membership.group.workspaceId}
        groupId={membership.group.id}
        groupMembershipId={membership.id}
        servicePlanImageRemaining={servicePlanImageRemaining}
        imageCreditAvailable={creditAccount?.availableCredits ?? null}
        pointCost={imagePointCost}
        initialAvailablePoints={availablePoints}
        initialMissionId={z.uuid().safeParse(query.mission).data}
        missions={available.map((mission) => {
          const rawSlides = (mission.content?.contentJson as Record<string, unknown> | null)?.[
            'slides'
          ];
          const slides: EditorialCarouselSlideInput[] = Array.isArray(rawSlides)
            ? rawSlides.flatMap((value) => {
                if (!value || typeof value !== 'object') return [];
                const slide = value as Record<string, unknown>;
                if (
                  !['HOOK', 'PROBLEM', 'INSIGHT', 'SOLUTION', 'CTA'].includes(
                    String(slide['role']),
                  ) ||
                  typeof slide['headline'] !== 'string' ||
                  typeof slide['body'] !== 'string'
                )
                  return [];
                return [
                  {
                    role: slide['role'] as EditorialCarouselSlideInput['role'],
                    headline: slide['headline'],
                    body: slide['body'],
                    ...(typeof slide['visualScene'] === 'string'
                      ? { visualScene: slide['visualScene'] }
                      : {}),
                  },
                ];
              })
            : [];
          return {
            id: mission.id,
            bunshinId: mission.bunshinId,
            bunshinName: mission.bunshin.name,
            topic: mission.topic,
            angle: mission.angle,
            format: mission.format as 'IMAGE' | 'SLIDE',
            layout: buildEditorialCarouselLayout({
              slides:
                ['SLIDE', 'IMAGE'].includes(mission.format) && slides.length
                  ? slides
                  : [{ role: 'HOOK', headline: mission.topic, body: mission.angle }],
              accentColor: brand?.primaryColor ?? '#EF6A63',
            }),
            campaignId: mission.campaignId,
            productPackVersionId:
              mission.contentLinkUsage?.productPackVersionId ??
              mission.campaign?.productPackVersionId ??
              null,
            request: requests.find((request) => request.dailyMissionId === mission.id) ?? null,
          };
        })}
      />
    </main>
  );
}
