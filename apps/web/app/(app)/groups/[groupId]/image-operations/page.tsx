import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { buildSocialImagePilotStatus } from '../../../../../src/social-image-pilot-status';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  DRAFT: '準備中',
  QUEUED: '受付済み',
  GENERATING_ASSET: '画像を作成中',
  COMPOSING: '文字を重ねています',
  READY_FOR_REVIEW: '完成',
  FAILED: '失敗',
  CANCELLED: '中止',
};

export default async function GroupImageOperationsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const groupId = z.uuid().safeParse((await params).groupId);
  if (!groupId.success) notFound();
  const db = await import('@bunshin/database');
  const group = await db.prisma.group.findFirst({
    where: {
      id: groupId.data,
      status: 'ACTIVE',
      OR: [
        { memberships: { some: { userId: actor.userId, role: 'MANAGER', status: 'ACTIVE' } } },
        {
          workspace: {
            memberships: {
              some: { userId: actor.userId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
            },
          },
        },
      ],
    },
    select: { id: true, workspaceId: true, name: true, workspace: { select: { name: true } } },
  });
  const platformAdmin = await db.prisma.platformAdmin.findFirst({
    where: { userId: actor.userId, status: 'ACTIVE' },
    select: { id: true },
  });
  const scopedGroup =
    group ??
    (platformAdmin
      ? await db.prisma.group.findFirst({
          where: { id: groupId.data },
          select: {
            id: true,
            workspaceId: true,
            name: true,
            workspace: { select: { name: true } },
          },
        })
      : null);
  if (!scopedGroup) notFound();
  const pilot = await db.prisma.socialImageGenerationPilot.findFirst({
    where: { workspaceId: scopedGroup.workspaceId, groupId: scopedGroup.id, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  const evidence = pilot
    ? await db.prisma.socialImagePilotEvidence.findMany({
        where: {
          workspaceId: scopedGroup.workspaceId,
          groupId: scopedGroup.id,
          pilotId: pilot.id,
        },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        select: { checkKey: true, action: true },
      })
    : [];
  const effectiveStatus = buildSocialImagePilotStatus({ pilot, evidence, now: new Date() });
  const requests = await db.prisma.socialImageGenerationRequest.findMany({
    where: { workspaceId: scopedGroup.workspaceId, groupId: scopedGroup.id },
    select: {
      id: true,
      groupMembershipId: true,
      ownerUserId: true,
      dailyMissionId: true,
      status: true,
      errorCode: true,
      createdAt: true,
      media: { select: { status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const members = await db.prisma.groupMembership.findMany({
    where: { workspaceId: scopedGroup.workspaceId, groupId: scopedGroup.id, status: 'ACTIVE' },
    select: { id: true, user: { select: { displayName: true } } },
    orderBy: { user: { displayName: 'asc' } },
  });
  const total = requests.length;
  const completed = requests.filter((item) => item.status === 'READY_FOR_REVIEW').length;
  const adopted = requests.filter((item) =>
    item.media.some((media) => media.status === 'ADOPTED'),
  ).length;
  const failed = requests.filter((item) => item.status === 'FAILED').length;
  const missionIds = [...new Set(requests.map((item) => item.dailyMissionId))];
  const ownerUserIds = [...new Set(requests.map((item) => item.ownerUserId))];
  const requestIdSet = new Set(requests.map((item) => item.id));
  const [posted, imageUsage] = await Promise.all([
    missionIds.length
      ? db.prisma.postRecord.count({
          where: {
            workspaceId: scopedGroup.workspaceId,
            dailyMissionId: { in: missionIds },
            bunshin: { ownerUserId: { in: ownerUserIds } },
          },
        })
      : 0,
    db.prisma.aiUsageEvent.findMany({
      where: { workspaceId: scopedGroup.workspaceId, taskType: 'SOCIAL_IMAGE_GENERATION' },
      select: { idempotencyKey: true, estimatedCostUsdMicros: true },
      orderBy: { occurredAt: 'desc' },
      take: 2000,
    }),
  ]);
  const requestCountByMission = new Map<string, number>();
  for (const request of requests)
    requestCountByMission.set(
      request.dailyMissionId,
      (requestCountByMission.get(request.dailyMissionId) ?? 0) + 1,
    );
  const regenerated = [...requestCountByMission.values()].filter((value) => value > 1).length;
  const costMicros = imageUsage.reduce((sum, item) => {
    const requestId = item.idempotencyKey.split(':')[1];
    return requestId && requestIdSet.has(requestId)
      ? sum + (item.estimatedCostUsdMicros ?? 0n)
      : sum;
  }, 0n);
  const costUsd = (Number(costMicros) / 1_000_000).toFixed(2);
  const percent = (value: number, base: number) =>
    base ? `${Math.round((value / base) * 100)}%` : '―';
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">グループ管理者向け</p>
        <h1>画像生成の利用状況</h1>
        <p>
          {scopedGroup.workspace.name}／{scopedGroup.name}
          の件数だけを表示します。参加者の文章、知識、記憶、作成画像は表示しません。
        </p>
        <Link href="/groups">← グループ一覧へ戻る</Link>
      </header>
      <section className="settings-card">
        <h2>現在の試験設定</h2>
        <p>
          状態：<strong>{effectiveStatus.label}</strong>
          {pilot ? ` ／ 第${pilot.version}版` : ''}
        </p>
        {effectiveStatus.state === 'PREPARING' ? (
          <p>
            本部管理者による開始前確認があと{effectiveStatus.remainingChecks}
            件あります。完了するまで画像は生成できません。
          </p>
        ) : null}
        {pilot ? (
          <p>
            上限：1日{pilot.dailyLimit}回 ／ グループ月{pilot.monthlyLimit}回 ／ 1人月
            {pilot.memberMonthlyLimit}回
          </p>
        ) : (
          <p>本部管理者が試験設定を行うまで画像は生成できません。</p>
        )}
      </section>
      <section className="settings-card">
        <h2>全体の利用状況（直近500件）</h2>
        <p>
          受付 {total}件 ／ 完成 {completed}件 ／ 失敗 {failed}件 ／ 採用 {adopted}件
        </p>
        <p>
          成功率：{percent(completed, total)} ／ 完成後の採用率：{percent(adopted, completed)}
        </p>
        <p>
          作り直した企画の割合：{percent(regenerated, missionIds.length)} ／ 投稿済み率：
          {percent(posted, completed)}
        </p>
        <p>記録済みの概算AI原価：${costUsd}</p>
      </section>
      <section className="settings-card">
        <h2>参加者ごとの件数</h2>
        <ul>
          {members.map((member) => {
            const own = requests.filter((item) => item.groupMembershipId === member.id);
            const ok = own.filter((item) => item.status === 'READY_FOR_REVIEW').length;
            const use = own.filter((item) =>
              item.media.some((media) => media.status === 'ADOPTED'),
            ).length;
            return (
              <li key={member.id}>
                <strong>{member.user.displayName}</strong>：受付 {own.length}件／完成 {ok}件／採用{' '}
                {use}件
              </li>
            );
          })}
        </ul>
      </section>
      <section className="settings-card">
        <h2>最近の処理</h2>
        {requests.length ? (
          <ul>
            {requests.slice(0, 30).map((item) => (
              <li key={item.id}>
                {item.createdAt.toLocaleString('ja-JP')}：{statusLabel[item.status] ?? item.status}
                {item.errorCode ? `（理由：${item.errorCode}）` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>まだ画像生成は行われていません。</p>
        )}
      </section>
    </main>
  );
}
