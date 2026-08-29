import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { currentUserProvider } from '../../../../../src/auth/current-user';
import { GroupKnowledgeManager } from '../../../../ui/group-knowledge-manager';

export const dynamic = 'force-dynamic';

export default async function GroupKnowledgePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = z.uuid().safeParse((await params).groupId);
  if (!parsed.success) notFound();
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      groupId: parsed.data,
      userId: actor.userId,
      role: 'MANAGER',
      status: 'ACTIVE',
      consentedAt: { not: null },
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { group: { select: { id: true, name: true, workspaceId: true } } },
  });
  if (!membership) notFound();
  const sources = await new db.PrismaGroupKnowledgeRepository().listForManagement({
    workspaceId: membership.group.workspaceId,
    groupId: membership.group.id,
    actorUserId: actor.userId,
  });
  if (!sources) notFound();

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">グループの公式情報</p>
        <h1>投稿づくりで使うナレッジ</h1>
        <p>{membership.group.name}の商品資料、FAQ、研修動画、公式Webページを登録します。</p>
        <p>保存しただけでは投稿に使いません。読み取った内容を管理者が確認してから利用します。</p>
        <Link href="/groups">← グループ一覧へ戻る</Link>
      </header>
      <GroupKnowledgeManager
        workspaceId={membership.group.workspaceId}
        groupId={membership.group.id}
        initialSources={sources.map((source) => ({
          id: source.id,
          type: source.type,
          title: source.title,
          sourceUri: source.sourceUri,
          originalFileName: source.originalFileName,
          status: source.status,
          version: source.version,
          failureCode: source.failureCode,
          updatedAt: source.updatedAt.toISOString(),
        }))}
      />
    </main>
  );
}
