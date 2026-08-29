import {
  FulfillBadgeRewardManually,
  InspectBadgeRewardOperations,
  RetryBadgeRewardOperation,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Route } from 'next';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const operationSchema = z.object({
  workspaceId: z.uuid(),
  rewardLinkId: z.uuid(),
  reason: z.string().trim().min(3).max(1000),
  returnWorkspaceId: z.string().optional(),
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

const destination = (workspaceId?: string) =>
  `/admin/badges/rewards${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`;
const destinationWithResult = (
  workspaceId: string | undefined,
  key: string,
  value: string,
): Route => {
  const separator = workspaceId ? '&' : '?';
  return `${destination(workspaceId)}${separator}${key}=${encodeURIComponent(value)}` as Route;
};

async function retryReward(formData: FormData) {
  'use server';
  const parsed = operationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/admin/badges/rewards?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  try {
    await new RetryBadgeRewardOperation(
      new db.PrismaBadgeRewardOperationsRepository(db.prisma),
    ).execute({
      workspaceId: parsed.data.workspaceId,
      rewardLinkId: parsed.data.rewardLinkId,
      actorUserId: actor.userId,
      reason: parsed.data.reason,
    });
  } catch (error) {
    const code = error instanceof ApplicationError ? error.code.toLowerCase() : 'failed';
    redirect(destinationWithResult(parsed.data.returnWorkspaceId, 'error', code));
  }
  revalidatePath('/admin/badges/rewards');
  redirect(destinationWithResult(parsed.data.returnWorkspaceId, 'retried', '1'));
}

async function fulfillReward(formData: FormData) {
  'use server';
  const parsed = operationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/admin/badges/rewards?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  try {
    await new FulfillBadgeRewardManually(
      new db.PrismaBadgeRewardOperationsRepository(db.prisma),
    ).execute({
      workspaceId: parsed.data.workspaceId,
      rewardLinkId: parsed.data.rewardLinkId,
      actorUserId: actor.userId,
      reason: parsed.data.reason,
    });
  } catch (error) {
    const code = error instanceof ApplicationError ? error.code.toLowerCase() : 'failed';
    redirect(destinationWithResult(parsed.data.returnWorkspaceId, 'error', code));
  }
  revalidatePath('/admin/badges/rewards');
  redirect(destinationWithResult(parsed.data.returnWorkspaceId, 'fulfilled', '1'));
}

const linkStatusLabel = {
  PENDING: '付与待ち',
  PROCESSING: '処理中',
  COMPLETED: '付与済み',
  FAILED: '処理失敗',
  CANCELLED: '取消済み',
} as const;
const outboxStatusLabel = {
  PENDING: '待機中',
  PROCESSING: '処理中',
  COMPLETED: '完了',
  RETRY: '再実行待ち',
  DEAD: '自動再実行停止',
  CANCELLED: '取消済み',
} as const;

const date = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat('ja-JP', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Tokyo',
      }).format(value)
    : 'なし';

export default async function BadgeRewardOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    workspaceId?: string;
    retried?: string;
    fulfilled?: string;
    error?: string;
  }>;
}) {
  const { db } = await requireSuperAdmin();
  const query = await searchParams;
  const workspaceId = z.uuid().safeParse(query.workspaceId).success ? query.workspaceId! : null;
  const [snapshot, workspaces] = await Promise.all([
    new InspectBadgeRewardOperations(
      new db.PrismaBadgeRewardOperationsRepository(db.prisma),
    ).execute({ workspaceId, limit: 100 }),
    db.prisma.workspace.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
  ]);
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">システム管理者</p>
        <h1>バッジ特典の運用</h1>
        <p>特典の付与状況を確認し、自動処理が止まった場合だけ安全に対応します。</p>
        <p>
          <a href="/admin/badges">グループバッジの確認へ戻る</a>
        </p>
      </header>

      {query.retried ? <p className="notice notice--success">再実行を受け付けました。</p> : null}
      {query.fulfilled ? <p className="notice notice--success">特典を付与しました。</p> : null}
      {query.error ? (
        <p className="notice notice--danger">
          操作できませんでした。現在の状態を確認してください。
        </p>
      ) : null}

      <section className="settings-card">
        <h2>表示する会社・ワークスペース</h2>
        <form method="get" className="form-stack">
          <label className="field">
            <span className="field__label">対象</span>
            <select className="field__control" name="workspaceId" defaultValue={workspaceId ?? ''}>
              <option value="">すべて</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button button--secondary" type="submit">
            表示を更新
          </button>
        </form>
      </section>

      <section className="settings-card">
        <h2>特典の付与状況</h2>
        <p>通常は自動で付与されます。「自動再実行停止」の場合だけ再実行してください。</p>
        {snapshot.rewards.length === 0 ? (
          <p>対象の特典はありません。</p>
        ) : (
          snapshot.rewards.map((reward) => {
            const canRetry = reward.linkStatus === 'FAILED' || reward.outboxStatus === 'DEAD';
            const canFulfill =
              reward.entitlementStatus === null &&
              ['PENDING', 'FAILED'].includes(reward.linkStatus) &&
              ['PENDING', 'RETRY', 'DEAD'].includes(reward.outboxStatus);
            return (
              <article className="settings-card" key={reward.rewardLinkId}>
                <h3>{reward.badgeTitle}</h3>
                <p>
                  {reward.workspaceName}
                  {reward.groupName ? `／${reward.groupName}` : ''}／{reward.userDisplayName}
                </p>
                <p>
                  特典：<strong>{linkStatusLabel[reward.linkStatus]}</strong>／自動処理：
                  <strong>{outboxStatusLabel[reward.outboxStatus]}</strong>
                </p>
                <p>
                  試行回数：{reward.attemptCount}/{reward.maxAttempts}／残り回数：
                  {reward.quantityRemaining ?? '未付与'}／期限：{date(reward.expiresAt)}
                </p>
                {reward.failureCode ? <p>停止理由：{reward.failureCode}</p> : null}
                {canRetry ? (
                  <form action={retryReward} className="form-stack">
                    <input type="hidden" name="workspaceId" value={reward.workspaceId} />
                    <input type="hidden" name="rewardLinkId" value={reward.rewardLinkId} />
                    <input type="hidden" name="returnWorkspaceId" value={workspaceId ?? ''} />
                    <label className="field">
                      <span className="field__label">再実行する理由</span>
                      <input className="field__control" name="reason" minLength={3} required />
                    </label>
                    <button className="button button--secondary" type="submit">
                      自動処理をもう一度実行
                    </button>
                  </form>
                ) : null}
                {canFulfill ? (
                  <details>
                    <summary>管理者が今すぐ付与する</summary>
                    <p>自動処理を待たずに付与します。重複付与はできません。</p>
                    <form action={fulfillReward} className="form-stack">
                      <input type="hidden" name="workspaceId" value={reward.workspaceId} />
                      <input type="hidden" name="rewardLinkId" value={reward.rewardLinkId} />
                      <input type="hidden" name="returnWorkspaceId" value={workspaceId ?? ''} />
                      <label className="field">
                        <span className="field__label">手動で付与する理由</span>
                        <input className="field__control" name="reason" minLength={3} required />
                      </label>
                      <button className="button" type="submit">
                        特典を付与する
                      </button>
                    </form>
                  </details>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      <section className="settings-card">
        <h2>特典を使った履歴</h2>
        {snapshot.usages.length === 0 ? (
          <p>利用履歴はまだありません。</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>会社・利用者</th>
                  <th>バッジ・用途</th>
                  <th>状態</th>
                  <th>日時</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.usages.map((usage) => (
                  <tr key={usage.usageId}>
                    <td>
                      {usage.workspaceName}／{usage.userDisplayName}
                    </td>
                    <td>
                      {usage.badgeTitle}／{usage.featureKey}
                    </td>
                    <td>{usage.status === 'CONSUMED' ? '使用済み' : '返却済み'}</td>
                    <td>{date(usage.refundedAt ?? usage.consumedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="settings-card">
        <h2>管理者の操作履歴</h2>
        {snapshot.audits.length === 0 ? (
          <p>管理者による操作はまだありません。</p>
        ) : (
          <ul>
            {snapshot.audits.map((audit) => (
              <li key={audit.auditId}>
                {date(audit.occurredAt)}／{audit.performedBy}／
                {audit.action === 'BADGE_REWARD_RETRY' ? '再実行' : '手動付与'}／{audit.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
