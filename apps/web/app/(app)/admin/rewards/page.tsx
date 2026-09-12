import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { currentUserProvider } from '../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const date = (value: Date) =>
  new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(value);

const eventLabel = (value: string) =>
  value === 'MISSION_VIEWED'
    ? '今日の企画を確認'
    : value === 'POSTED'
      ? '投稿完了'
      : value === 'MISSION_ACCEPTED'
        ? '企画を採用'
        : value === 'FEEDBACK_RECORDED'
          ? '感想を送信'
          : value === 'IMAGE_COMPLETED'
            ? '画像を作成'
            : '利用行動';

export default async function RewardsProcessingAdminPage() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await db.prisma.platformAdmin.findFirst({
    where: { userId: actor.userId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!admin) notFound();

  const now = new Date();
  const recentFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);
  const activeOwnerWhere = {
    workspace: { status: 'ACTIVE' as const },
    user: { status: 'ACTIVE' as const },
  };
  const processingIssueWhere = {
    ...activeOwnerWhere,
    OR: [
      { status: 'FAILED' as const },
      { status: 'PROCESSING' as const, updatedAt: { lt: staleBefore } },
    ],
  };

  const [
    recentPointProcessing,
    recentBadgeProcessing,
    pointIssueCount,
    badgeIssueCount,
    pointIssues,
    badgeIssues,
    stoppedServices,
  ] = await Promise.all([
    db.prisma.pointProcessingEvent.count({
      where: {
        ...activeOwnerWhere,
        status: 'COMPLETED',
        processedAt: { gte: recentFrom, lte: now },
      },
    }),
    db.prisma.badgeProcessingEvent.count({
      where: {
        ...activeOwnerWhere,
        status: 'COMPLETED',
        processedAt: { gte: recentFrom, lte: now },
      },
    }),
    db.prisma.pointProcessingEvent.count({ where: processingIssueWhere }),
    db.prisma.badgeProcessingEvent.count({ where: processingIssueWhere }),
    db.prisma.pointProcessingEvent.findMany({
      where: processingIssueWhere,
      include: {
        workspace: { select: { name: true } },
        user: { select: { displayName: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    }),
    db.prisma.badgeProcessingEvent.findMany({
      where: processingIssueWhere,
      include: {
        workspace: { select: { name: true } },
        user: { select: { displayName: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    }),
    db.prisma.serviceConfiguration.findMany({
      where: { pointIssuanceStopped: true, group: { status: 'ACTIVE' } },
      select: { id: true, displayName: true, slug: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
    }),
  ]);
  const issues = [
    ...pointIssues.map((item) => ({ ...item, kind: 'ポイント' })),
    ...badgeIssues.map((item) => ({ ...item, kind: 'バッジ' })),
  ].sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime());

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>ポイント・バッジの自動反映</h1>
        <p>無料運用中のポイントとバッジが、利用者の行動から自動反映されているか確認します。</p>
      </header>

      <section className="settings-card" aria-labelledby="automatic-rewards-title">
        <h2 id="automatic-rewards-title">現在の処理状態</h2>
        <p>
          過去24時間に、ポイント<strong>{recentPointProcessing}件</strong>、バッジ
          <strong>{recentBadgeProcessing}件</strong>の行動を処理しました。
        </p>
        {pointIssueCount + badgeIssueCount === 0 ? (
          <p className="status-success">
            <strong>現在、止まっている自動反映はありません。</strong>
          </p>
        ) : (
          <>
            <p className="status-warning">
              <strong>
                ポイント{pointIssueCount}件、バッジ{badgeIssueCount}件を確認してください。
              </strong>
            </p>
            <p>
              失敗した処理は定期処理で自動再試行されます。10分以上この画面に残る場合は、定期処理の稼働状況を確認してください。
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>種類</th>
                    <th>行動</th>
                    <th>利用者</th>
                    <th>団体</th>
                    <th>状態</th>
                    <th>最終処理</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((item) => (
                    <tr key={`${item.kind}-${item.id}`}>
                      <td>{item.kind}</td>
                      <td>{eventLabel(item.eventType)}</td>
                      <td>{item.user.displayName || '名前未設定'}</td>
                      <td>{item.workspace.name}</td>
                      <td>
                        {item.status === 'FAILED' ? '自動再試行待ち' : '処理が長引いています'}
                      </td>
                      <td>{date(item.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pointIssueCount + badgeIssueCount > issues.length ? (
              <p>古いものから最初の{issues.length}件を表示しています。</p>
            ) : null}
            <Link href="/admin/guide" className="button button--secondary">
              定期処理の確認手順を見る
            </Link>
          </>
        )}
      </section>

      <section className="settings-card" aria-labelledby="stopped-point-services-title">
        <h2 id="stopped-point-services-title">ポイント付与を停止中のサービス</h2>
        {stoppedServices.length === 0 ? (
          <p className="status-success">停止中のサービスはありません。</p>
        ) : (
          <>
            <p>
              次の{stoppedServices.length}
              件はポイント付与が停止中です。意図した停止か、サービス運営者へ確認してください。
            </p>
            <ul>
              {stoppedServices.map((service) => (
                <li key={service.id}>
                  <strong>{service.displayName}</strong>（{service.slug}）／停止状態の最終更新：
                  {date(service.updatedAt)}
                </li>
              ))}
            </ul>
            <Link href="/admin/services" className="button button--secondary">
              サービス管理を見る
            </Link>
          </>
        )}
      </section>

      <Link href="/admin" className="button button--secondary">
        運用設定へ戻る
      </Link>
    </main>
  );
}
