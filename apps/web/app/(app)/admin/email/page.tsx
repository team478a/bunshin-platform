import { ListAdminEmailConfigurations } from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentAdminEmailEnvironment } from '../../../../src/email/secure-admin-email-configuration';
import { AdminEmailEditor } from './admin-email-editor';
export const dynamic = 'force-dynamic';
export default async function AdminEmailPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const environment = currentAdminEmailEnvironment();
  const values = await new ListAdminEmailConfigurations(
    new db.PrismaAdminEmailConfigurationRepository(),
  )
    .execute(user.userId, environment)
    .catch(() => null);
  if (!values) notFound();
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>障害メールの設定</h1>
        <p>大切な障害をResendから管理者へ知らせます。</p>
      </header>
      <section className="settings-card">
        <h2>現在の環境</h2>
        <p>
          <strong>{environment}</strong>
        </p>
        <p>この環境の設定だけを使います。</p>
      </section>
      <AdminEmailEditor
        environment={environment}
        initialConfigurations={values.map((value) => ({
          ...value,
          lastVerifiedAt: value.lastVerifiedAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
