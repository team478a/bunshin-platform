import {
  CreateAndSubmitGroupBadge,
  NominateGroupBadgeCandidate,
  ReviewGroupBadgeCandidate,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import Link from 'next/link';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { BadgeCsvImporter } from './badge-csv-importer';

export const dynamic = 'force-dynamic';

const draftSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  code: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  altText: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(3).max(1000),
});
const nominateSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  badgeVersionId: z.uuid(),
  userId: z.uuid(),
  reason: z.string().trim().min(3).max(1000),
});
const reviewSchema = z.object({
  groupId: z.uuid(),
  candidateId: z.uuid(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().min(3).max(1000),
});

const path = (groupId: string, query = '') => `/groups/${groupId}/badges${query}` as Route;
const errorCode = (error: unknown) =>
  error instanceof ApplicationError && error.code === 'FORBIDDEN' ? 'forbidden' : 'failed';

async function createBadge(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = draftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  try {
    const db = await import('@bunshin/database');
    await new CreateAndSubmitGroupBadge(
      new db.PrismaBadgeGroupWorkflowRepository(db.prisma),
    ).execute({
      ...parsed.data,
      imageKey: `badges/groups/${parsed.data.groupId}/${parsed.data.code.toLowerCase()}.svg`,
      actorUserId: actor.userId,
    });
  } catch (error) {
    redirect(path(parsed.data.groupId, `?error=${errorCode(error)}`));
  }
  revalidatePath(path(parsed.data.groupId));
  redirect(path(parsed.data.groupId, '?created=1'));
}

async function nominate(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = nominateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  try {
    const db = await import('@bunshin/database');
    await new NominateGroupBadgeCandidate(
      new db.PrismaBadgeGroupWorkflowRepository(db.prisma),
    ).execute({ ...parsed.data, actorUserId: actor.userId });
  } catch (error) {
    redirect(path(parsed.data.groupId, `?error=${errorCode(error)}`));
  }
  revalidatePath(path(parsed.data.groupId));
  redirect(path(parsed.data.groupId, '?nominated=1'));
}

async function reviewCandidate(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  try {
    const db = await import('@bunshin/database');
    await new ReviewGroupBadgeCandidate(
      new db.PrismaBadgeGroupWorkflowRepository(db.prisma),
    ).execute({
      candidateId: parsed.data.candidateId,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
      actorUserId: actor.userId,
    });
  } catch (error) {
    redirect(path(parsed.data.groupId, `?error=${errorCode(error)}`));
  }
  revalidatePath(path(parsed.data.groupId));
  redirect(path(parsed.data.groupId, '?reviewed=1'));
}

const approvalLabel = {
  PENDING: '本部の確認待ち',
  APPROVED: '使用できます',
  REJECTED: '見直しが必要',
} as const;

export default async function GroupBadgesPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{
    created?: string;
    nominated?: string;
    reviewed?: string;
    error?: string;
  }>;
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
      memberships: { some: { userId: actor.userId, role: 'MANAGER', status: 'ACTIVE' } },
    },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      memberships: {
        where: { status: 'ACTIVE' },
        select: { userId: true, user: { select: { displayName: true, email: true } } },
        orderBy: { user: { displayName: 'asc' } },
      },
    },
  });
  if (!group) notFound();
  const [definitions, candidates] = await Promise.all([
    db.prisma.badgeDefinition.findMany({
      where: { workspaceId: group.workspaceId, groupId: group.id, ownerType: 'GROUP' },
      include: {
        versions: { include: { approvalRequests: true }, orderBy: { version: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.prisma.badgeAwardCandidate.findMany({
      where: { workspaceId: group.workspaceId, groupId: group.id },
      include: {
        user: { select: { displayName: true } },
        nominatedBy: { select: { displayName: true } },
        badgeVersion: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  const activeVersions = definitions.flatMap((definition) =>
    definition.versions.filter((version) => version.publishedAt !== null),
  );
  const query = await searchParams;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">グループ管理者</p>
        <h1>{group.name}のバッジ</h1>
        <p>グループで使うバッジを本部へ申請し、参加者への付与を二人で確認します。</p>
        <Link href={`/groups/${group.id}/members`}>← 参加者管理へ戻る</Link>
      </header>
      {query.created ? (
        <p className="notice notice--success">バッジ案を本部へ送りました。</p>
      ) : null}
      {query.nominated ? <p className="notice notice--success">付与候補を登録しました。</p> : null}
      {query.reviewed ? (
        <p className="notice notice--success">候補者の確認を保存しました。</p>
      ) : null}
      {query.error ? (
        <p className="notice notice--danger">
          保存できませんでした。権限と入力内容を確認してください。
        </p>
      ) : null}

      <section className="settings-card">
        <h2>新しいバッジを本部へ申請</h2>
        <p>申請後、本部が内容を確認するまで参加者には付与できません。</p>
        <form action={createBadge} className="form-stack">
          <input type="hidden" name="workspaceId" value={group.workspaceId} />
          <input type="hidden" name="groupId" value={group.id} />
          <label className="field">
            <span className="field__label">管理用コード（英数字）</span>
            <input className="field__control" name="code" placeholder="HELPER" required />
          </label>
          <label className="field">
            <span className="field__label">種類</span>
            <input className="field__control" name="category" placeholder="活動・貢献" required />
          </label>
          <label className="field">
            <span className="field__label">バッジ名</span>
            <input
              className="field__control"
              name="title"
              placeholder="みんなのお助け役"
              required
            />
          </label>
          <label className="field">
            <span className="field__label">もらえる理由</span>
            <textarea className="field__control" name="description" required />
          </label>
          <label className="field">
            <span className="field__label">画像の説明</span>
            <input
              className="field__control"
              name="altText"
              placeholder="助け合いを表す星形のバッジ"
              required
            />
          </label>
          <label className="field">
            <span className="field__label">申請理由</span>
            <textarea className="field__control" name="reason" minLength={3} required />
          </label>
          <button className="button" type="submit">
            本部へ申請する
          </button>
        </form>
      </section>

      <section className="settings-card">
        <h2>申請したバッジ</h2>
        {definitions.length === 0 ? (
          <p>まだ申請はありません。</p>
        ) : (
          <ul>
            {definitions.map((definition) => {
              const version = definition.versions[0];
              const approval = version?.approvalRequests[0];
              return (
                <li key={definition.id}>
                  <strong>{version?.title ?? definition.code}</strong>（{definition.code}）—{' '}
                  {approval ? approvalLabel[approval.status] : '準備中'}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="settings-card">
        <h2>参加者を付与候補にする</h2>
        {activeVersions.length === 0 ? (
          <p>本部の承認が終わったバッジがありません。</p>
        ) : (
          <form action={nominate} className="form-stack">
            <input type="hidden" name="workspaceId" value={group.workspaceId} />
            <input type="hidden" name="groupId" value={group.id} />
            <label className="field">
              <span className="field__label">バッジ</span>
              <select className="field__control" name="badgeVersionId">
                {activeVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">参加者</span>
              <select className="field__control" name="userId">
                {group.memberships.map((membership) => (
                  <option key={membership.userId} value={membership.userId}>
                    {membership.user.displayName}（{membership.user.email ?? 'メールなし'}）
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">推薦する理由</span>
              <textarea className="field__control" name="reason" minLength={3} required />
            </label>
            <button className="button" type="submit">
              候補として登録
            </button>
          </form>
        )}
      </section>

      <BadgeCsvImporter workspaceId={group.workspaceId} groupId={group.id} />

      <section className="settings-card">
        <h2>候補者を別の管理者が確認</h2>
        <p>推薦した本人と候補者本人は承認できません。</p>
        {candidates.length === 0 ? (
          <p>候補者はまだいません。</p>
        ) : (
          candidates.map((candidate) => (
            <article key={candidate.id} className="settings-card">
              <h3>
                {candidate.user.displayName}：{candidate.badgeVersion.title}
              </h3>
              <p>
                状態：
                {candidate.status === 'PENDING'
                  ? '確認待ち'
                  : candidate.status === 'APPROVED'
                    ? '付与済み'
                    : '見送り'}
              </p>
              <p>
                推薦者：{candidate.nominatedBy.displayName}／理由：{candidate.nominationReason}
              </p>
              {candidate.status === 'PENDING' ? (
                <form action={reviewCandidate} className="form-stack">
                  <input type="hidden" name="groupId" value={group.id} />
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <label className="field">
                    <span className="field__label">判断</span>
                    <select className="field__control" name="decision">
                      <option value="APPROVED">バッジを付与する</option>
                      <option value="REJECTED">今回は見送る</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">確認理由</span>
                    <textarea className="field__control" name="reason" minLength={3} required />
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
