import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { ServiceRegistrationEmailEditor } from './service-registration-email-editor';

export const dynamic = 'force-dynamic';

export default async function ServiceRegistrationEmailPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const { serviceSlug } = await params;
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const [configuration, deliveries] = await Promise.all([
    db.prisma.serviceRegistrationEmailConfiguration.findUnique({
      where: { groupId: service.serviceId },
    }),
    db.prisma.serviceRegistrationEmailDelivery.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      select: {
        id: true,
        recipientEmail: true,
        status: true,
        attemptCount: true,
        sentAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  const defaultBody = [
    '{{name}} 様',
    '',
    '{{serviceName}}への登録が完了しました。',
    'サービス画面から利用を開始してください。',
  ].join('\n');
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>登録完了メール</h1>
          <p>認証メールとは別に、参加完了後の案内を自社名義で送ります。</p>
        </header>
        <section className="settings-card">
          <ServiceRegistrationEmailEditor
            serviceSlug={serviceSlug}
            value={{
              enabled: configuration?.enabled ?? false,
              providerMode: configuration?.providerMode ?? 'PLATFORM',
              apiKeyMask: configuration?.apiKeyMask ?? null,
              fromName: configuration?.fromName ?? service.configuration.operatorName,
              fromEmail: configuration?.fromEmail ?? service.configuration.contactEmail ?? '',
              replyToEmail: configuration?.replyToEmail ?? service.configuration.contactEmail ?? '',
              subject:
                configuration?.subject ??
                `【${service.configuration.displayName}】登録が完了しました`,
              body: configuration?.body ?? defaultBody,
              verified:
                configuration?.lastVerifiedAt !== null &&
                configuration?.lastVerifiedAt !== undefined,
            }}
          />
        </section>
        <section className="settings-card">
          <h2>最近の配信</h2>
          {deliveries.length === 0 ? (
            <p>配信履歴はまだありません。</p>
          ) : (
            <ul>
              {deliveries.map((item) => (
                <li key={item.id}>
                  {item.recipientEmail} — {item.status}（試行 {item.attemptCount}回）
                </li>
              ))}
            </ul>
          )}
        </section>
        <a href={`/s/${serviceSlug}/manage`}>サービス管理へ戻る</a>
      </main>
    </PublicShell>
  );
}
