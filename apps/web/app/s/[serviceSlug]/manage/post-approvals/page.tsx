import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { MissionContent } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-content';
import { PublicShell } from '../../../../ui/public-shell';
import { campaignOpen } from '@bunshin/database';

export const dynamic = 'force-dynamic';

const policySchema = z.object({ required: z.enum(['true', 'false']) });
const reviewSchema = z.object({
  requestId: z.uuid(),
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  reviewNote: z.string().trim().max(1000),
});
const auditActionLabel = {
  REQUESTED: '確認を依頼',
  APPROVED: '使用を許可',
  CHANGES_REQUESTED: '見直しを依頼',
  RESUBMITTED: 'もう一度確認を依頼',
  POLICY_UPDATED: '確認ルールを変更',
} as const;

function contentRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function path(serviceSlug: string) {
  return `/s/${serviceSlug}/manage/post-approvals` as Route;
}

export default async function ServicePostApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ saved?: string; reviewed?: string; error?: string }>;
}) {
  const { serviceSlug } = await params;
  const query = await searchParams;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(path(serviceSlug))}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const group = await db.prisma.group.findFirst({
    where: { id: service.serviceId, workspaceId: service.workspaceId, status: 'ACTIVE' },
    select: { id: true, workspaceId: true, name: true },
  });
  if (!group) notFound();

  async function savePolicy(formData: FormData) {
    'use server';
    const current = await (await currentUserProvider()).getCurrentUser();
    if (!current) redirect(`/login?returnTo=${encodeURIComponent(path(serviceSlug))}`);
    const value = policySchema.safeParse(Object.fromEntries(formData));
    if (!value.success) redirect(`${path(serviceSlug)}?error=policy` as Route);
    const currentService = await resolveManagedServiceContext(serviceSlug, current.userId).catch(
      () => null,
    );
    if (!currentService) redirect('/');
    const database = await import('@bunshin/database');
    await new database.PrismaCampaignPostingApprovalRepository().updatePolicy({
      workspaceId: currentService.workspaceId,
      groupId: currentService.serviceId,
      actorUserId: current.userId,
      required: value.data.required === 'true',
      now: new Date(),
    });
    revalidatePath(path(serviceSlug));
    redirect(`${path(serviceSlug)}?saved=1` as Route);
  }

  async function review(formData: FormData) {
    'use server';
    const current = await (await currentUserProvider()).getCurrentUser();
    if (!current) redirect(`/login?returnTo=${encodeURIComponent(path(serviceSlug))}`);
    const value = reviewSchema.safeParse(Object.fromEntries(formData));
    if (!value.success) redirect(`${path(serviceSlug)}?error=review` as Route);
    const currentService = await resolveManagedServiceContext(serviceSlug, current.userId).catch(
      () => null,
    );
    if (!currentService) redirect('/');
    const database = await import('@bunshin/database');
    const reviewed = await new database.PrismaCampaignPostingApprovalRepository().review({
      workspaceId: currentService.workspaceId,
      groupId: currentService.serviceId,
      actorUserId: current.userId,
      requestId: value.data.requestId,
      decision: value.data.decision,
      reviewNote: value.data.reviewNote || null,
      now: new Date(),
    });
    if (reviewed === 'CAMPAIGN_UNAVAILABLE')
      redirect(`${path(serviceSlug)}?error=campaign` as Route);
    if (reviewed !== 'REVIEWED') redirect(`${path(serviceSlug)}?error=missing` as Route);
    revalidatePath(path(serviceSlug));
    redirect(`${path(serviceSlug)}?reviewed=1` as Route);
  }

  const now = new Date();
  const [policy, requests] = await Promise.all([
    db.prisma.campaignPostingApprovalPolicy.findUnique({ where: { groupId: group.id } }),
    db.prisma.campaignPostingApprovalRequest.findMany({
      where: { workspaceId: group.workspaceId, groupId: group.id },
      include: {
        campaign: { select: { name: true, status: true, startsAt: true, endsAt: true } },
        bunshin: { select: { name: true } },
        dailyMission: { select: { format: true } },
        requestedBy: { select: { displayName: true } },
        audits: {
          select: { action: true, note: true, occurredAt: true },
          orderBy: { occurredAt: 'desc' },
          take: 10,
        },
      },
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
      take: 100,
    }),
  ]);

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>商品投稿の確認</h1>
          <p>商品・キャンペーンを含む投稿だけを、参加者がコピーする前に確認できます。</p>
        </header>
        {query.saved === '1' ? (
          <p className="notice notice--success">設定を保存しました。</p>
        ) : null}
        {query.reviewed === '1' ? (
          <p className="notice notice--success">投稿案を確認しました。</p>
        ) : null}
        {query.error === 'campaign' ? (
          <p className="notice notice--danger">
            この企画は終了または中止したため、確認できません。参加者もこの投稿案はコピーできません。
          </p>
        ) : query.error ? (
          <p className="notice notice--danger">
            操作を完了できませんでした。画面を更新してもう一度お試しください。
          </p>
        ) : null}
        <nav aria-label="投稿確認の項目" className="settings-anchor-nav">
          <a href="#approval-policy">確認のルール</a>
          <a href="#approval-requests">
            確認を待つ投稿案（
            {
              requests.filter(
                (item) => item.status === 'PENDING' && campaignOpen(item.campaign, now),
              ).length
            }
            件）
          </a>
        </nav>
        <section className="settings-card" id="approval-policy">
          <h2>確認のルール</h2>
          <p>通常の投稿は止めません。商品またはキャンペーンを含む投稿だけが対象です。</p>
          <p>
            確認するに変えると、公開中の企画ですでに作られた投稿案も、確認が終わるまでコピーできなくなります。
          </p>
          <form action={savePolicy} className="form-stack">
            <label className="field">
              <span className="field__label">コピー前の確認</span>
              <select
                className="field__control"
                name="required"
                defaultValue={policy?.required ? 'true' : 'false'}
              >
                <option value="false">確認しない（すぐコピーできる）</option>
                <option value="true">確認する（管理者が確認してからコピー）</option>
              </select>
            </label>
            <button className="button" type="submit">
              このルールを保存する
            </button>
          </form>
        </section>
        <section className="settings-card" id="approval-requests">
          <h2>確認を待っている投稿案</h2>
          {requests.length === 0 ? (
            <p>まだ投稿案はありません。</p>
          ) : (
            <div className="admin-list">
              {requests.map((request) => (
                <article className="admin-list__item" key={request.id}>
                  <h3>
                    {request.campaign.name}
                    {campaignOpen(request.campaign, now) ? '' : '（終了・中止）'}
                  </h3>
                  <p>
                    投稿人格：{request.bunshin.name} ／ 参加者：{request.requestedBy.displayName}
                  </p>
                  <p>
                    状態：
                    {request.status === 'PENDING'
                      ? '確認待ち'
                      : request.status === 'APPROVED'
                        ? '使用可'
                        : '見直しが必要'}
                  </p>
                  <p>作成：{request.requestedAt.toLocaleString('ja-JP')}</p>
                  <details>
                    <summary>この投稿案を確認する</summary>
                    <p>商品・キャンペーン投稿の確認に必要な内容だけを表示しています。</p>
                    <MissionContent
                      mission={{
                        format: request.dailyMission.format,
                        content: contentRecord(request.contentSnapshot),
                      }}
                    />
                  </details>
                  {request.audits.length > 0 ? (
                    <details>
                      <summary>確認の履歴を見る</summary>
                      <ul>
                        {request.audits.map((audit) => (
                          <li key={`${audit.occurredAt.toISOString()}:${audit.action}`}>
                            {audit.occurredAt.toLocaleString('ja-JP')}：
                            {auditActionLabel[audit.action]}
                            {audit.note ? `（${audit.note}）` : ''}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {request.status === 'PENDING' && !campaignOpen(request.campaign, now) ? (
                    <p>
                      この企画は終了または中止したため、確認は不要です。参加者もコピーできません。
                    </p>
                  ) : request.status === 'PENDING' ? (
                    <form action={review} className="form-stack">
                      <input type="hidden" name="requestId" value={request.id} />
                      <label className="field">
                        <span className="field__label">参加者への案内（任意）</span>
                        <textarea
                          className="field__control"
                          name="reviewNote"
                          maxLength={1000}
                          placeholder="例：必須表記を確認しました。"
                        />
                      </label>
                      <div className="button-row">
                        <button className="button" name="decision" value="APPROVED" type="submit">
                          使用を許可する
                        </button>
                        <button
                          className="button button--secondary"
                          name="decision"
                          value="CHANGES_REQUESTED"
                          type="submit"
                        >
                          見直しを依頼する
                        </button>
                      </div>
                    </form>
                  ) : request.reviewNote ? (
                    <p>案内：{request.reviewNote}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
