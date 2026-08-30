import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { VideoProjectCreator } from '../../../../ui/video-project-creator';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  DRAFT: '準備中',
  WAITING_APPROVAL: '内容を確認してください',
  APPROVED: '確認済み',
  COMPLETED: '完成',
  FAILED: '作成できませんでした',
};

export default async function VideosPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams?: Promise<{ service?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const groupId = z.uuid().safeParse((await params).groupId);
  if (!groupId.success) notFound();
  const db = await import('@bunshin/database');
  const now = new Date();
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      groupId: groupId.data,
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
            OR: [{ startsAt: null }, { startsAt: { lte: now } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
          },
        },
      },
      featureAssignments: {
        some: {
          featureKey: 'VIDEO_GENERATION',
          status: 'ENABLED',
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
        },
      },
    },
    select: { id: true, group: { select: { id: true, name: true, workspaceId: true } } },
  });
  if (!membership) notFound();

  const [bunshins, campaigns, projects] = await Promise.all([
    db.prisma.bunshin.findMany({
      where: {
        workspaceId: membership.group.workspaceId,
        ownerUserId: actor.userId,
        status: { not: 'ARCHIVED' },
      },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.prisma.campaign.findMany({
      where: {
        workspaceId: membership.group.workspaceId,
        groupId: membership.group.id,
        status: 'OPEN',
        startsAt: { lte: now },
        endsAt: { gt: now },
        participations: { some: { userId: actor.userId, status: 'ACCEPTED' } },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.prisma.videoProject.findMany({
      where: {
        workspaceId: membership.group.workspaceId,
        groupId: membership.group.id,
        groupMembershipId: membership.id,
        ownerUserId: actor.userId,
      },
      select: { id: true, title: true, status: true, durationSeconds: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
  ]);

  const serviceSlug = (await searchParams)?.service;
  const serviceBase = serviceSlug ? `/s/${serviceSlug}` : null;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">動画づくり</p>
        <h1>動画の企画と台本</h1>
        <p>{membership.group.name}で使う短い動画を、分身と一緒に考えます。</p>
        <p>ここでは企画と台本を作ります。動画本体は、内容を確認したあとに作ります。</p>
        <a href={serviceBase ? `${serviceBase}/home` : '/groups'}>← 戻る</a>{' '}
        <a
          href={
            serviceBase
              ? `${serviceBase}/video-assets`
              : `/groups/${membership.group.id}/video-assets`
          }
        >
          写真・動画・ロゴを管理
        </a>
      </header>
      <VideoProjectCreator
        workspaceId={membership.group.workspaceId}
        groupId={membership.group.id}
        groupMembershipId={membership.id}
        bunshins={bunshins}
        campaigns={campaigns}
      />
      <section className="settings-card">
        <h2>作成中の動画</h2>
        {projects.length === 0 ? <p>まだありません。</p> : null}
        <div className="form-stack">
          {projects.map((project) => (
            <a
              key={project.id}
              href={
                serviceBase
                  ? `${serviceBase}/videos/${project.id}`
                  : `/groups/${membership.group.id}/videos/${project.id}`
              }
            >
              <strong>{project.title}</strong>（{project.durationSeconds}秒）—{' '}
              {statusLabel[project.status] ?? '作成中'}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
