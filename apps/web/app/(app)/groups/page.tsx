import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const roleLabel = {
  MANAGER: 'グループ管理者',
  PARTICIPANT: '参加者',
} as const;

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; declined?: string; error?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const memberships = await db.prisma.groupMembership.findMany({
    where: {
      userId: actor.userId,
      status: 'ACTIVE',
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: {
      id: true,
      role: true,
      featureAssignments: {
        where: {
          featureKey: { in: ['VIDEO_GENERATION', 'SOCIAL.IMAGE_GENERATION'] },
          status: 'ENABLED',
        },
        select: { featureKey: true, startsAt: true, endsAt: true },
      },
      group: {
        select: {
          id: true,
          name: true,
          workspace: { select: { name: true } },
          featurePolicies: {
            where: {
              featureKey: { in: ['VIDEO_GENERATION', 'SOCIAL.IMAGE_GENERATION'] },
              status: 'ENABLED',
            },
            select: { featureKey: true, startsAt: true, endsAt: true },
          },
          _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
        },
      },
    },
    orderBy: { group: { name: 'asc' } },
  });
  const query = await searchParams;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">参加中のサービス</p>
        <h1>あなたの活動プログラム</h1>
        <p>参加中の活動プログラムと、今日使える機能を確認できます。</p>
      </header>

      {memberships.length > 0 ? (
        <section className="group-dashboard-summary" aria-label="参加状況のまとめ">
          <div>
            <span>参加中</span>
            <strong>{memberships.length}件</strong>
          </div>
          <div>
            <span>運営できるもの</span>
            <strong>
              {memberships.filter((membership) => membership.role === 'MANAGER').length}件
            </strong>
          </div>
        </section>
      ) : null}

      {query.joined === '1' ? (
        <p className="notice notice--success" role="status">
          グループに参加しました。
        </p>
      ) : null}
      {query.declined === '1' ? (
        <p className="notice" role="status">
          今回は参加しませんでした。
        </p>
      ) : null}
      {query.error === 'invitation' ? (
        <p className="notice notice--danger" role="alert">
          招待リンクを使用できませんでした。期限切れまたは使用済みの可能性があります。
        </p>
      ) : null}

      {memberships.length === 0 ? (
        <section className="settings-card">
          <h2>参加中のグループはありません</h2>
          <p>グループから招待されると、ここに表示されます。</p>
        </section>
      ) : null}

      {memberships.map((membership) => {
        const now = new Date();
        const active = (value: { startsAt: Date | null; endsAt: Date | null }) =>
          (!value.startsAt || value.startsAt <= now) && (!value.endsAt || value.endsAt > now);
        const videoAvailable =
          membership.group.featurePolicies.some(
            (item) => item.featureKey === 'VIDEO_GENERATION' && active(item),
          ) &&
          membership.featureAssignments.some(
            (item) => item.featureKey === 'VIDEO_GENERATION' && active(item),
          );
        const imageAvailable =
          membership.group.featurePolicies.some(
            (item) => item.featureKey === 'SOCIAL.IMAGE_GENERATION' && active(item),
          ) &&
          membership.featureAssignments.some(
            (item) => item.featureKey === 'SOCIAL.IMAGE_GENERATION' && active(item),
          );
        return (
          <section className="group-dashboard-card" key={membership.id}>
            <div className="group-dashboard-card__heading">
              <div>
                <p>{membership.group.workspace.name}</p>
                <h2>{membership.group.name}</h2>
              </div>
              <span>{roleLabel[membership.role]}</span>
            </div>
            <p className="group-dashboard-card__meta">
              参加者 {membership.group._count.memberships}人
            </p>
            <div className="group-dashboard-card__availability">
              <span className={videoAvailable ? 'is-available' : ''}>
                動画 {videoAvailable ? '利用可' : '未設定'}
              </span>
              <span className={imageAvailable ? 'is-available' : ''}>
                画像 {imageAvailable ? '利用可' : '未設定'}
              </span>
            </div>
            <div className="group-dashboard-card__actions">
              {videoAvailable ? (
                <>
                  <Link className="button" href={`/groups/${membership.group.id}/videos`}>
                    動画を作る
                  </Link>
                  <Link
                    className="button button--secondary"
                    href={`/groups/${membership.group.id}/video-assets`}
                  >
                    動画に使う素材を管理
                  </Link>
                </>
              ) : null}
              {imageAvailable ? (
                <Link className="button" href={`/groups/${membership.group.id}/images`}>
                  投稿に使う画像を作る
                </Link>
              ) : null}
              {membership.role === 'MANAGER' ? (
                <>
                  <Link className="button" href={`/groups/${membership.group.id}/knowledge`}>
                    公式資料・FAQを登録
                  </Link>
                  <Link className="button" href={`/groups/${membership.group.id}/members`}>
                    参加者が使える機能を設定
                  </Link>
                  <Link
                    className="button button--secondary"
                    href={`/groups/${membership.group.id}/badges`}
                  >
                    グループのバッジを管理
                  </Link>
                  {imageAvailable ? (
                    <Link
                      className="button button--secondary"
                      href={`/groups/${membership.group.id}/image-operations`}
                    >
                      画像生成の利用状況
                    </Link>
                  ) : null}
                </>
              ) : (
                <p className="group-dashboard-card__hint">
                  使える機能はグループ管理者が設定します。
                </p>
              )}
            </div>
          </section>
        );
      })}
    </main>
  );
}
