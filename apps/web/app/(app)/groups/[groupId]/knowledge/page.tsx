import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { currentUserProvider } from '../../../../../src/auth/current-user';
import { summarizeGroupKnowledgeUsage } from '../../../../../src/knowledge/group-knowledge-usage';
import { GroupKnowledgeManager } from '../../../../ui/group-knowledge-manager';

export const dynamic = 'force-dynamic';

const auditActionLabel = {
  CREATED: '資料を登録',
  PROCESSING_STARTED: '読み取りを開始',
  EXTRACTION_SAVED: '読み取り結果を保存',
  FAILED: '読み取りに失敗',
  APPROVED: '投稿づくりでの利用を開始',
  ARCHIVED: '資料の利用を停止',
  PRODUCT_SCOPE_UPDATED: '資料を使う範囲を変更',
  REVIEW_EDITED: '読み取った内容を修正',
} as const;

function dateTime(value: Date) {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(value);
}

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
  const [sources, productVersions, audits, usageSnapshots] = await Promise.all([
    new db.PrismaGroupKnowledgeRepository().listForManagement({
      workspaceId: membership.group.workspaceId,
      groupId: membership.group.id,
      actorUserId: actor.userId,
    }),
    db.prisma.productPackVersion.findMany({
      where: {
        status: 'PUBLISHED',
        productPack: {
          workspaceId: membership.group.workspaceId,
          groupId: membership.group.id,
          status: 'ACTIVE',
        },
      },
      select: {
        id: true,
        version: true,
        productPack: { select: { name: true } },
      },
      orderBy: [{ productPack: { name: 'asc' } }, { version: 'desc' }],
    }),
    db.prisma.groupKnowledgeAuditLog.findMany({
      where: {
        workspaceId: membership.group.workspaceId,
        groupId: membership.group.id,
      },
      select: {
        id: true,
        action: true,
        createdAt: true,
        source: { select: { title: true } },
        actor: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.prisma.generationContextSnapshot.findMany({
      where: {
        workspaceId: membership.group.workspaceId,
        dailyMission: { campaign: { groupId: membership.group.id } },
      },
      select: { payload: true, generatedAt: true },
    }),
  ]);
  if (!sources) notFound();
  const usageChunks = await db.prisma.groupKnowledgeChunk.findMany({
    where: { source: { workspaceId: membership.group.workspaceId, groupId: membership.group.id } },
    select: { id: true, sourceId: true },
  });
  const usageBySource = new Map(
    summarizeGroupKnowledgeUsage(usageSnapshots, usageChunks).map((usage) => [
      usage.sourceId,
      usage,
    ]),
  );

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
        productVersions={productVersions.map((item) => ({
          id: item.id,
          label: `${item.productPack.name}（第${item.version}版）`,
        }))}
        initialSources={sources.map((source) => {
          const usage = usageBySource.get(source.id);
          return {
            id: source.id,
            type: source.type,
            title: source.title,
            sourceUri: source.sourceUri,
            originalFileName: source.originalFileName,
            productPackVersionId: source.productPackVersionId,
            status: source.status,
            version: source.version,
            failureCode: source.failureCode,
            updatedAt: source.updatedAt.toISOString(),
            generationCount: usage?.generationCount ?? 0,
            lastUsedAt: usage?.lastUsedAt.toISOString() ?? null,
          };
        })}
      />
      <section className="settings-card">
        <h2>資料の変更履歴</h2>
        <p>グループの共有資料に対して行われた操作を、新しい順に50件まで表示します。</p>
        {audits.length === 0 ? <p>変更履歴はまだありません。</p> : null}
        <ul className="plain-list">
          {audits.map((audit) => (
            <li key={audit.id}>
              <strong>{audit.source.title}</strong>
              <br />
              {auditActionLabel[audit.action]} ／ 操作：{audit.actor.displayName} ／{' '}
              {dateTime(audit.createdAt)}
            </li>
          ))}
        </ul>
        <p>この画面を更新すると、最新の操作が表示されます。資料の本文や秘密情報は表示しません。</p>
      </section>
    </main>
  );
}
