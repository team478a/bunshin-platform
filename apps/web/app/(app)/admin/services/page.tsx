import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { ServiceEditor } from './service-editor';

export const dynamic = 'force-dynamic';

export default async function ServicesAdminPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    user.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();
  const [workspaces, services] = await Promise.all([
    db.prisma.workspace.findMany({
      where: { type: 'ORGANIZATION', status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.prisma.serviceConfiguration.findMany({
      include: { group: { select: { status: true } }, registration: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">システム管理者</p>
        <h1>サービス管理</h1>
        <p>独立した名前・登録URL・ブランドを持つサービスを作成します。</p>
      </header>
      {workspaces.length > 0 ? (
        <ServiceEditor workspaces={workspaces} />
      ) : (
        <section className="settings-card">
          <h2>先に運営団体を作成してください</h2>
        </section>
      )}
      <section className="settings-card">
        <h2>作成済みのサービス</h2>
        {services.length === 0 ? (
          <p>まだサービスはありません。</p>
        ) : (
          <ul>
            {services.map((service) => (
              <li key={service.id}>
                <strong>{service.displayName}</strong> —{' '}
                {service.visibility === 'PUBLIC' ? '公開中' : '準備中'} ／ 登録：
                {service.registration?.mode ?? '未設定'} ／ 内部状態：{service.group.status}
                <br />
                <code>/s/{service.slug}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
