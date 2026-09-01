import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { CreditAdjustmentEditor } from './credit-adjustment-editor';

export const dynamic = 'force-dynamic';

export default async function ServiceCreditManagementPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/credits`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();

  const db = await import('@bunshin/database');
  const memberships = await db.prisma.groupMembership.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      status: 'ACTIVE',
      serviceRole: 'PARTICIPANT',
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      user: { select: { displayName: true, email: true } },
      serviceCreditAccount: { select: { availableCredits: true } },
    },
  });
  const adjustments = await db.prisma.serviceConfigurationAudit.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      action: 'SERVICE_CREDIT_ADJUSTED',
    },
    orderBy: { occurredAt: 'desc' },
    take: 50,
    select: {
      afterData: true,
      reason: true,
      occurredAt: true,
      performedBy: { select: { displayName: true, email: true } },
    },
  });
  const memberNames = new Map(
    memberships.map((membership) => [
      membership.id,
      membership.user.displayName || membership.user.email || membership.id,
    ]),
  );
  const history = adjustments.flatMap((item) => {
    const data = item.afterData;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
    const membershipId = data.membershipId;
    const amount = data.amount;
    const availableCredits = data.availableCredits;
    if (
      typeof membershipId !== 'string' ||
      typeof amount !== 'number' ||
      typeof availableCredits !== 'number'
    )
      return [];
    return [
      {
        membershipId,
        amount,
        availableCredits,
        reason: item.reason,
        occurredAt: item.occurredAt,
        actor: item.performedBy.displayName || item.performedBy.email || '運営担当者',
      },
    ];
  });

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>画像作成回数の調整</h1>
          <p>参加者ごとに、画像作成に使える回数を付与または減額します。</p>
          <a href={`/s/${serviceSlug}/manage`}>← 管理メニューへ戻る</a>
        </header>
        <section className="settings-card">
          <h2>使い方</h2>
          <p>
            回数を追加する場合はプラス、取り消す場合はマイナスで入力します。理由と実行者は履歴に残ります。
          </p>
          <p>残高より多い回数を減らすことはできません。参加者の投稿内容はここでは表示しません。</p>
        </section>
        <CreditAdjustmentEditor
          serviceSlug={serviceSlug}
          memberships={memberships.map((membership) => ({
            id: membership.id,
            label: membership.user.displayName || membership.user.email || membership.id,
            availableCredits: membership.serviceCreditAccount?.availableCredits ?? 0,
          }))}
        />
        <section className="settings-card">
          <h2>最近の変更履歴</h2>
          <p>
            直近50件を表示しています。ここでの変更は取り消せないため、訂正する場合は反対の回数を入力してください。
          </p>
          {history.length === 0 ? (
            <p>まだ変更履歴はありません。</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>参加者</th>
                    <th>変更</th>
                    <th>変更後</th>
                    <th>理由</th>
                    <th>実行者</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={`${item.membershipId}:${item.occurredAt.toISOString()}`}>
                      <td>{item.occurredAt.toLocaleString('ja-JP')}</td>
                      <td>{memberNames.get(item.membershipId) ?? '参加者（退会済み）'}</td>
                      <td>{item.amount > 0 ? `+${item.amount}` : item.amount}</td>
                      <td>{item.availableCredits} 回</td>
                      <td>{item.reason}</td>
                      <td>{item.actor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
