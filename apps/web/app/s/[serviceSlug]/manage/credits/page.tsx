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
      </main>
    </PublicShell>
  );
}
