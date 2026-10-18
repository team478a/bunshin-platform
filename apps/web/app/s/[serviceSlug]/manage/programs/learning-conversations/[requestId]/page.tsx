import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../../../src/services/public-service';
import { PublicShell } from '../../../../../../ui/public-shell';
import { PrismaPersonalLearningConversationRepository, prisma } from '@bunshin/database';

export const dynamic = 'force-dynamic';
export default async function SharedLearningConversation({
  params,
}: {
  params: Promise<{ serviceSlug: string; requestId: string }>;
}) {
  const { serviceSlug, requestId } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/programs/learning-conversations/${requestId}`)}`,
    );
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service || !['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(service.serviceRole)) notFound();
  const request = await prisma.personalLearningRequest.findFirst({
    where: { id: requestId, workspaceId: service.workspaceId, groupId: service.serviceId },
    orderBy: { revision: 'desc' },
    select: { id: true, programEnrollmentId: true },
  });
  if (!request) notFound();
  const conversation = await new PrismaPersonalLearningConversationRepository(prisma)
    .readSharedConversationForOperator({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      programEnrollmentId: request.programEnrollmentId,
      requestId: request.id,
      operatorUserId: actor.userId,
    })
    .catch(() => null);
  if (!conversation) notFound();
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page stack">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>共有された研修の会話</h1>
          <p>
            閲覧記録を監査ログに保存しました。共有が取り消されると、この画面からは閲覧できなくなります。
          </p>
          <a href={`/s/${serviceSlug}/manage/programs/learning-conversations`}>共有一覧へ戻る</a>
        </header>
        <section className="card stack">
          {conversation.messages.map((message) => (
            <article key={message.id}>
              <h2>{message.role === 'USER' ? '受講者' : 'AI'}</h2>
              <p>{message.text}</p>
            </article>
          ))}
        </section>
      </main>
    </PublicShell>
  );
}
