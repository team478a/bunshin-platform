import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { ServiceMessageTemplateEditor } from './service-message-template-editor';

export const dynamic = 'force-dynamic';

export default async function ServiceMessageTemplatesPage({
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
  const templates = await db.prisma.serviceMessageTemplate.findMany({
    where: { workspaceId: service.workspaceId, groupId: service.serviceId },
    orderBy: [{ channel: 'asc' }, { purpose: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      channel: true,
      purpose: true,
      name: true,
      subject: true,
      body: true,
      isActive: true,
    },
  });
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>配信テンプレート</h1>
          <p>送る用途ごとに文面を保存し、メールとLINEの配信準備を早くします。</p>
        </header>
        <ServiceMessageTemplateEditor serviceSlug={serviceSlug} initialTemplates={templates} />
        <a href={`/s/${serviceSlug}/manage`}>サービス管理へ戻る</a>
      </main>
    </PublicShell>
  );
}
