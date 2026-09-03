import { GetPointUserDashboard, ListPointRewardCatalog } from '@bunshin/application';
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
  const creditAccount = await db.prisma.serviceCreditAccount.findFirst({
    where: {
      workspaceId: membership.group.workspaceId,
      groupId: membership.group.id,
      groupMembershipId: membership.id,
      userId: actor.userId,
    },
    select: { availableCredits: true },
  });
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
        <p className="eyebrow">SNS画像づくり</p>
        <h1>投稿に使う画像</h1>
        <p>{membership.group.name}の投稿案から、スマートフォンで使える画像を作ります。</p>
        <p>内容を確認して「この画像を使う」を押すまで、採用にはなりません。</p>
        <a href={serviceHome}>← 戻る</a>
      </header>
      <SocialImageWorkspace
        workspaceId={membership.group.workspaceId}
        groupId={membership.group.id}
        groupMembershipId={membership.id}
        imageCreditAvailable={creditAccount?.availableCredits ?? null}
        pointCost={imagePointCost}
        initialAvailablePoints={availablePoints}
        initialMissionId={z.uuid().safeParse(query.mission).data}
        missions={available.map((mission) => ({
          id: mission.id,
          bunshinId: mission.bunshinId,
          bunshinName: mission.bunshin.name,
          topic: mission.topic,
          angle: mission.angle,
          format: mission.format as 'IMAGE' | 'SLIDE',
          campaignId: mission.campaignId,
          productPackVersionId:
            mission.contentLinkUsage?.productPackVersionId ??
            mission.campaign?.productPackVersionId ??
            null,
          request: requests.find((request) => request.dailyMissionId === mission.id) ?? null,
        }))}
      />
    </main>
  );
}
