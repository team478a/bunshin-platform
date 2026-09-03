import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  DRAFT: '準備中',
  QUEUED: '受付済み',
  GENERATING_ASSET: '画像を作成中',
  COMPOSING: '文字を重ねています',
  READY_FOR_REVIEW: '完成',
  FAILED: '失敗',
  CANCELLED: '中止',
};

export default async function ServiceImageOperationsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/image-operations`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();

  const db = await import('@bunshin/database');
  const [requests, members] = await Promise.all([
    db.prisma.socialImageGenerationRequest.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      select: {
        id: true,
        groupMembershipId: true,
        status: true,
        errorCode: true,
        createdAt: true,
        media: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    db.prisma.groupMembership.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'ACTIVE',
        serviceRole: 'PARTICIPANT',
      },
      select: { id: true, user: { select: { displayName: true, email: true } } },
      orderBy: { user: { displayName: 'asc' } },
    }),
  ]);

  const total = requests.length;
  const completed = requests.filter((item) => item.status === 'READY_FOR_REVIEW').length;
  const failed = requests.filter((item) => item.status === 'FAILED').length;
  const adopted = requests.filter((item) =>
    item.media.some((media) => media.status === 'ADOPTED'),
  ).length;
  const percent = (value: number, base: number) =>
    base ? `${Math.round((value / base) * 100)}%` : '―';

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>画像生成の利用状況</h1>
          <p>
            このサービス全体の件数だけを確認できます。参加者が作った画像や投稿本文は表示しません。
          </p>
          <a href={`/s/${serviceSlug}/manage`}>← 管理メニューへ戻る</a>
        </header>
        <section className="settings-card">
          <h2>全体の利用状況（直近500件）</h2>
          <p>
            受付 {total}件 ／ 完成 {completed}件 ／ 失敗 {failed}件 ／ 採用 {adopted}件
          </p>
          <p>
            完成率：{percent(completed, total)} ／ 完成後の採用率：{percent(adopted, completed)}
          </p>
          <p>失敗が続く場合は、システム管理者へ連絡してください。</p>
        </section>
        <section className="settings-card">
          <h2>参加者ごとの件数</h2>
          {members.length === 0 ? (
            <p>参加者がまだいません。</p>
          ) : (
            <ul className="settings-status-list">
              {members.map((member) => {
                const own = requests.filter((item) => item.groupMembershipId === member.id);
                const ownCompleted = own.filter(
                  (item) => item.status === 'READY_FOR_REVIEW',
                ).length;
                const ownFailed = own.filter((item) => item.status === 'FAILED').length;
                const ownAdopted = own.filter((item) =>
                  item.media.some((media) => media.status === 'ADOPTED'),
                ).length;
                return (
                  <li className="settings-status-item" key={member.id}>
                    <strong>{member.user.displayName || member.user.email || '参加者'}</strong>
                    <span>
                      受付 {own.length}件 ／ 完成 {ownCompleted}件 ／ 採用 {ownAdopted}件 ／ 失敗{' '}
                      {ownFailed}件
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="settings-card">
          <h2>最近の処理</h2>
          {requests.length === 0 ? (
            <p>まだ画像生成は行われていません。</p>
          ) : (
            <ul className="settings-status-list">
              {requests.slice(0, 30).map((item) => (
                <li className="settings-status-item" key={item.id}>
                  <span>{item.createdAt.toLocaleString('ja-JP')}</span>
                  <span>
                    {statusLabel[item.status] ?? item.status}
                    {item.errorCode ? '（確認が必要です）' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
