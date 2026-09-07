import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';

export const dynamic = 'force-dynamic';

const linkStatusLabel: Record<string, string> = {
  DRAFT: '確認待ち',
  ACTIVE: '使用中',
  SUSPENDED: '停止中',
  EXPIRED: '期限切れ',
  DELETED: '削除済み',
};

export default async function ServiceMemberProductOperationsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/member-products`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();

  const since = new Date(Date.now() - 28 * 86_400_000);
  const db = await import('@bunshin/database');
  const [profiles, activities] = await Promise.all([
    db.prisma.memberProductProfile.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      select: {
        id: true,
        name: true,
        archivedAt: true,
        updatedAt: true,
        user: { select: { displayName: true, email: true } },
        productPack: { select: { name: true } },
        externalTrackingLink: {
          select: { status: true, system: { select: { name: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    }),
    db.prisma.memberProductContentActivity.groupBy({
      by: ['memberProductProfileId', 'type'],
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        occurredAt: { gte: since },
      },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<string, { generated: number; copied: number; posted: number }>();
  for (const activity of activities) {
    const current = counts.get(activity.memberProductProfileId) ?? {
      generated: 0,
      copied: 0,
      posted: 0,
    };
    if (activity.type === 'GENERATED') current.generated = activity._count._all;
    if (activity.type === 'COPIED') current.copied = activity._count._all;
    if (activity.type === 'POSTED') current.posted = activity._count._all;
    counts.set(activity.memberProductProfileId, current);
  }
  const totals = [...counts.values()].reduce(
    (sum, value) => ({
      generated: sum.generated + value.generated,
      copied: sum.copied + value.copied,
      posted: sum.posted + value.posted,
    }),
    { generated: 0, copied: 0, posted: 0 },
  );
  const percent = (value: number, base: number) =>
    base ? `${Math.round((value / base) * 100)}%` : '―';

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>保存商品の利用状況</h1>
          <p>
            直近28日間の商品別件数を確認できます。投稿文の本文や参加者の分身設定は表示しません。
          </p>
          <a href={`/s/${serviceSlug}/manage`}>← 管理メニューへ戻る</a>
        </header>

        <section className="settings-card">
          <h2>全体</h2>
          <p>
            投稿案作成 {totals.generated}件 ／ コピー {totals.copied}件 ／ 投稿完了 {totals.posted}
            件
          </p>
          <p>
            コピー率：{percent(totals.copied, totals.generated)} ／ 投稿完了率：
            {percent(totals.posted, totals.generated)}
          </p>
        </section>

        <section className="settings-card">
          <h2>商品ごとの状況</h2>
          {profiles.length === 0 ? (
            <p>保存商品はまだありません。</p>
          ) : (
            <ul className="settings-status-list">
              {profiles.map((profile) => {
                const value = counts.get(profile.id) ?? { generated: 0, copied: 0, posted: 0 };
                return (
                  <li className="settings-status-item" key={profile.id}>
                    <strong>
                      {profile.name}
                      {profile.archivedAt ? '（非表示）' : ''}
                    </strong>
                    <span>
                      {profile.user.displayName || profile.user.email || '参加者'} ／ 公式商品：
                      {profile.productPack?.name ?? '未関連付け'}
                    </span>
                    <span>
                      専用URL：{profile.externalTrackingLink.system.name}・
                      {linkStatusLabel[profile.externalTrackingLink.status] ??
                        profile.externalTrackingLink.status}
                    </span>
                    <span>
                      投稿案作成 {value.generated}件 ／ コピー {value.copied}件 ／ 投稿完了{' '}
                      {value.posted}件
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
