import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { VideoAssetUploader } from '../../../../ui/video-asset-uploader';

export const dynamic = 'force-dynamic';

export default async function VideoAssetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams?: Promise<{ service?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsedGroupId = z.uuid().safeParse((await params).groupId);
  if (!parsedGroupId.success) notFound();
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      groupId: parsedGroupId.data,
      userId: actor.userId,
      status: 'ACTIVE',
      consentedAt: { not: null },
      group: {
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        featurePolicies: {
          some: {
            featureKey: 'VIDEO_GENERATION',
            status: 'ENABLED',
            OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }],
          },
        },
      },
      featureAssignments: {
        some: {
          featureKey: 'VIDEO_GENERATION',
          status: 'ENABLED',
          OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }],
        },
      },
    },
    select: {
      id: true,
      group: { select: { id: true, name: true, workspaceId: true } },
    },
  });
  if (!membership) notFound();
  const assets = await db.prisma.videoAsset.findMany({
    where: {
      workspaceId: membership.group.workspaceId,
      groupId: membership.group.id,
      groupMembershipId: membership.id,
      ownerUserId: actor.userId,
      status: 'READY',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      kind: true,
      originalFilename: true,
      verifiedSizeBytes: true,
      width: true,
      height: true,
      durationMs: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const serviceSlug = (await searchParams)?.service;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">動画づくり</p>
        <h1>写真・動画・ロゴ</h1>
        <p>{membership.group.name}で作る動画に、自分の素材を使えるようにします。</p>
        <Link
          href={serviceSlug ? `/s/${serviceSlug}/videos` : `/groups/${membership.group.id}/videos`}
        >
          ← 動画一覧へ戻る
        </Link>
      </header>
      <VideoAssetUploader
        workspaceId={membership.group.workspaceId}
        groupId={membership.group.id}
        groupMembershipId={membership.id}
        initialAssets={assets.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          originalFilename: asset.originalFilename,
          sizeBytes: asset.verifiedSizeBytes,
          width: asset.width,
          height: asset.height,
          durationMs: asset.durationMs,
          createdAt: asset.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
