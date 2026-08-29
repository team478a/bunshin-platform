import { ReviewGroupBadge } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const reviewSchema = z.object({
  approvalRequestId: z.uuid(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().min(3).max(1000),
});

async function requireSuperAdmin() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await db.prisma.platformAdmin.findFirst({
    where: { userId: actor.userId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });
  if (!admin) notFound();
  return { actor, db };
}

async function review(formData: FormData) {
  'use server';
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/admin/badges?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  try {
    await new ReviewGroupBadge(new db.PrismaBadgeGroupWorkflowRepository(db.prisma)).execute({
      ...parsed.data,
      actorUserId: actor.userId,
    });
  } catch (error) {
    const code = error instanceof ApplicationError ? error.code.toLowerCase() : 'failed';
    redirect(`/admin/badges?error=${code}`);
  }
  revalidatePath('/admin/badges');
  redirect('/admin/badges?reviewed=1');
}

const statusLabel = { PENDING: '確認待ち', APPROVED: '承認済み', REJECTED: '差戻し' } as const;

export default async function BadgeApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ reviewed?: string; error?: string }>;
}) {
  const { db } = await requireSuperAdmin();
  const requests = await db.prisma.badgeApprovalRequest.findMany({
    include: {
      group: { select: { name: true } },
      requestedBy: { select: { displayName: true } },
      reviewedBy: { select: { displayName: true } },
      badgeVersion: { include: { definition: { select: { code: true, category: true } } } },
    },
    orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
    take: 200,
  });
  const query = await searchParams;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">システム管理者</p>
        <h1>グループバッジの確認</h1>
        <p>グループから届いたバッジ案を確認し、利用開始または差戻しを決めます。</p>
        <p>
          <a href="/admin/badges/rewards">特典の付与状況と失敗処理を確認</a>
        </p>
      </header>
      {query.reviewed ? <p className="notice notice--success">確認結果を保存しました。</p> : null}
      {query.error ? (
        <p className="notice notice--danger">保存できませんでした。内容を確認してください。</p>
      ) : null}
      <section className="settings-card">
        <h2>申請一覧</h2>
        {requests.length === 0 ? (
          <p>申請はまだありません。</p>
        ) : (
          requests.map((request) => (
            <article className="settings-card" key={request.id}>
              <h3>{request.badgeVersion.title}</h3>
              <p>
                グループ：{request.group.name}／コード：{request.badgeVersion.definition.code}
                ／種類：{request.badgeVersion.definition.category}
              </p>
              <p>{request.badgeVersion.description}</p>
              <p>画像の説明：{request.badgeVersion.altText}</p>
              <p>
                申請者：{request.requestedBy.displayName}／理由：{request.requestReason}
              </p>
              <p>
                状態：<strong>{statusLabel[request.status]}</strong>
              </p>
              {request.reviewedBy ? (
                <p>
                  確認者：{request.reviewedBy.displayName}／{request.reviewReason}
                </p>
              ) : null}
              {request.status === 'PENDING' ? (
                <form action={review} className="form-stack">
                  <input type="hidden" name="approvalRequestId" value={request.id} />
                  <label className="field">
                    <span className="field__label">確認結果</span>
                    <select className="field__control" name="decision">
                      <option value="APPROVED">利用を承認する</option>
                      <option value="REJECTED">グループへ差し戻す</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">判断した理由</span>
                    <textarea
                      className="field__control"
                      name="reason"
                      minLength={3}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <button className="button" type="submit">
                    確認結果を保存
                  </button>
                </form>
              ) : null}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
