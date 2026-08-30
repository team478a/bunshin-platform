import { ApplicationError } from '@bunshin/shared';
import { revalidatePath } from 'next/cache';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  type: z.enum(['TERMS', 'PRIVACY']),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(100_000),
  reason: z.string().trim().min(5).max(1000),
});
const publishSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  documentId: z.uuid(),
  effectiveAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .transform((value) => new Date(`${value}:00+09:00`)),
  reason: z.string().trim().min(5).max(1000),
});

const path = (groupId: string, query = '') => `/groups/${groupId}/legal${query}` as Route;

async function actorId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  return actor.userId;
}

async function canManage(workspaceId: string, groupId: string, userId: string) {
  const db = await import('@bunshin/database');
  const [manager, workspaceManager, platformAdmin] = await Promise.all([
    db.prisma.groupMembership.findFirst({
      where: { workspaceId, groupId, userId, role: 'MANAGER', status: 'ACTIVE' },
      select: { id: true },
    }),
    db.prisma.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        role: { in: ['OWNER', 'ADMIN'] },
        status: 'ACTIVE',
      },
      select: { id: true },
    }),
    db.prisma.platformAdmin.findFirst({
      where: { userId, role: { in: ['SUPER_ADMIN', 'OPERATOR'] }, status: 'ACTIVE' },
      select: { id: true },
    }),
  ]);
  return manager !== null || workspaceManager !== null || platformAdmin !== null;
}

async function createDraft(formData: FormData) {
  'use server';
  const input = createSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  const userId = await actorId();
  const db = await import('@bunshin/database');
  try {
    await db.prisma.$transaction(async (tx) => {
      const configuration = await tx.serviceConfiguration.findFirst({
        where: {
          workspaceId: input.data.workspaceId,
          groupId: input.data.groupId,
          group: { status: 'ACTIVE' },
        },
      });
      if (
        configuration === null ||
        !(await canManage(input.data.workspaceId, input.data.groupId, userId))
      )
        throw new ApplicationError('FORBIDDEN', 'service legal management denied');
      const latest = await tx.serviceLegalDocument.aggregate({
        where: { groupId: input.data.groupId, type: input.data.type },
        _max: { version: true },
      });
      const document = await tx.serviceLegalDocument.create({
        data: {
          workspaceId: input.data.workspaceId,
          groupId: input.data.groupId,
          configurationId: configuration.id,
          type: input.data.type,
          version: (latest._max.version ?? 0) + 1,
          title: input.data.title,
          content: input.data.content,
          createdByUserId: userId,
        },
      });
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: input.data.workspaceId,
          groupId: input.data.groupId,
          configurationId: configuration.id,
          action: 'LEGAL_DRAFT_CREATED',
          afterData: { documentId: document.id, type: document.type, version: document.version },
          reason: input.data.reason,
          performedByUserId: userId,
        },
      });
    });
  } catch (error) {
    const code = error instanceof ApplicationError ? 'forbidden' : 'failed';
    redirect(path(input.data.groupId, `?error=${code}`));
  }
  revalidatePath(path(input.data.groupId));
  redirect(path(input.data.groupId, '?created=1'));
}

async function publish(formData: FormData) {
  'use server';
  const input = publishSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  const userId = await actorId();
  const db = await import('@bunshin/database');
  try {
    await db.prisma.$transaction(async (tx) => {
      const document = await tx.serviceLegalDocument.findFirst({
        where: {
          id: input.data.documentId,
          workspaceId: input.data.workspaceId,
          groupId: input.data.groupId,
          status: 'DRAFT',
        },
      });
      if (
        document === null ||
        !(await canManage(input.data.workspaceId, input.data.groupId, userId))
      )
        throw new ApplicationError('FORBIDDEN', 'service legal publication denied');
      await tx.serviceLegalDocument.updateMany({
        where: { groupId: input.data.groupId, type: document.type, status: 'PUBLISHED' },
        data: { status: 'RETIRED' },
      });
      await tx.serviceLegalDocument.update({
        where: { id: document.id },
        data: {
          status: 'PUBLISHED',
          effectiveAt: input.data.effectiveAt,
          publishedAt: new Date(),
        },
      });
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: input.data.workspaceId,
          groupId: input.data.groupId,
          configurationId: document.configurationId,
          action: 'LEGAL_PUBLISHED',
          beforeData: { status: document.status },
          afterData: {
            documentId: document.id,
            type: document.type,
            version: document.version,
            status: 'PUBLISHED',
            effectiveAt: input.data.effectiveAt.toISOString(),
          },
          reason: input.data.reason,
          performedByUserId: userId,
        },
      });
    });
  } catch (error) {
    const code = error instanceof ApplicationError ? 'forbidden' : 'failed';
    redirect(path(input.data.groupId, `?error=${code}`));
  }
  revalidatePath(path(input.data.groupId));
  redirect(path(input.data.groupId, '?published=1'));
}

export default async function ServiceLegalPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ created?: string; published?: string; error?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).groupId);
  if (!parsed.success) notFound();
  const userId = await actorId();
  const db = await import('@bunshin/database');
  const service = await db.prisma.serviceConfiguration.findFirst({
    where: { groupId: parsed.data, group: { status: 'ACTIVE' } },
    include: {
      group: { select: { workspaceId: true } },
      legalDocuments: {
        include: { _count: { select: { consents: true } } },
        orderBy: [{ type: 'asc' }, { version: 'desc' }],
      },
    },
  });
  if (service === null || !(await canManage(service.group.workspaceId, service.groupId, userId)))
    notFound();
  const query = await searchParams;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">サービス運営</p>
        <h1>{service.displayName}の法務文書</h1>
        <p>参加者が登録時に確認する利用規約とプライバシーポリシーを管理します。</p>
        <a href={`/groups/${service.groupId}/members`}>← 参加者管理へ戻る</a>
      </header>
      {query.created === '1' && <p className="notice notice--success">下書きを保存しました。</p>}
      {query.published === '1' && (
        <p className="notice notice--success">新しい版を公開しました。</p>
      )}
      {query.error && (
        <p className="notice notice--danger" role="alert">
          {query.error === 'forbidden'
            ? 'このサービスの法務文書を変更する権限がありません。'
            : '保存できませんでした。もう一度お試しください。'}
        </p>
      )}
      <section className="settings-card">
        <h2>新しい版を下書き保存</h2>
        <p>公開中の本文は直接書き換えません。変更するときは新しい版を作成します。</p>
        <form className="form-stack" action={createDraft}>
          <input type="hidden" name="workspaceId" value={service.group.workspaceId} />
          <input type="hidden" name="groupId" value={service.groupId} />
          <label className="field">
            <span className="field__label">文書の種類</span>
            <select className="field__control" name="type">
              <option value="TERMS">利用規約</option>
              <option value="PRIVACY">プライバシーポリシー</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">タイトル</span>
            <input className="field__control" name="title" required maxLength={200} />
          </label>
          <label className="field">
            <span className="field__label">本文</span>
            <textarea
              className="field__control"
              name="content"
              required
              maxLength={100000}
              rows={18}
            />
          </label>
          <label className="field">
            <span className="field__label">作成理由</span>
            <input
              className="field__control"
              name="reason"
              required
              minLength={5}
              maxLength={1000}
            />
          </label>
          <button className="button" type="submit">
            下書きを保存する
          </button>
        </form>
      </section>
      <section className="settings-card">
        <h2>保存した文書</h2>
        {service.legalDocuments.length === 0 && <p>まだ文書はありません。</p>}
        <div className="admin-list">
          {service.legalDocuments.map((document) => (
            <article className="admin-list__item" key={document.id}>
              <h3>{document.title}</h3>
              <p>
                {document.type === 'TERMS' ? '利用規約' : 'プライバシー'}・第{document.version}版・
                {document.status === 'DRAFT'
                  ? '下書き'
                  : document.status === 'PUBLISHED'
                    ? '公開中'
                    : '旧版'}
              </p>
              <p>同意済み：{document._count.consents}人</p>
              <details>
                <summary>本文を確認</summary>
                <pre>{document.content}</pre>
              </details>
              {document.status === 'DRAFT' && (
                <form className="form-stack" action={publish}>
                  <input type="hidden" name="workspaceId" value={service.group.workspaceId} />
                  <input type="hidden" name="groupId" value={service.groupId} />
                  <input type="hidden" name="documentId" value={document.id} />
                  <label className="field">
                    <span className="field__label">利用開始日時</span>
                    <input
                      className="field__control"
                      name="effectiveAt"
                      type="datetime-local"
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">公開理由</span>
                    <input
                      className="field__control"
                      name="reason"
                      required
                      minLength={5}
                      maxLength={1000}
                    />
                  </label>
                  <button className="button" type="submit">
                    この版を公開する
                  </button>
                </form>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
