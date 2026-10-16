import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../../src/services/public-service';
import { PublicShell } from '../../../../../ui/public-shell';
import { personalLearningFeatureEnabled } from '@bunshin/capability-training';

export const dynamic = 'force-dynamic';
const SHARE_EVENT = 'PERSONAL_LEARNING_CONVERSATION_SHARE';
const VERSION = 'PERSONAL_LEARNING_CONVERSATION_V1';
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export default async function LearningConversationInbox({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/programs/learning-conversations`)}`,
    );
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service || !['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(service.serviceRole)) notFound();
  const db = await import('@bunshin/database');
  const configuredPrograms = await db.prisma.serviceProgram.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
    },
    select: { id: true, settings: true },
  });
  const programs = configuredPrograms.filter(({ settings }) =>
    personalLearningFeatureEnabled(settings, 'conversation'),
  );
  const enrollmentIds = programs.length
    ? (
        await db.prisma.programEnrollment.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            serviceProgramId: { in: programs.map(({ id }) => id) },
          },
          select: { id: true },
        })
      ).map(({ id }) => id)
    : [];
  const events = enrollmentIds.length
    ? await db.prisma.programActionEvent.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          programEnrollmentId: { in: enrollmentIds },
          eventType: SHARE_EVENT,
        },
        select: {
          id: true,
          programEnrollmentId: true,
          actorUserId: true,
          occurredAt: true,
          metadata: true,
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 2000,
      })
    : [];
  const latest = new Map<string, (typeof events)[number]>();
  for (const event of events) {
    const metadata = object(event.metadata);
    if (
      metadata.version !== VERSION ||
      typeof metadata.threadId !== 'string' ||
      typeof metadata.requestRevision !== 'number'
    )
      continue;
    const key = `${event.programEnrollmentId}:${event.actorUserId}:${metadata.threadId}:${metadata.requestRevision}`;
    const previous = latest.get(key);
    if (
      !previous ||
      Number(metadata.shareRevision ?? 0) > Number(object(previous.metadata).shareRevision ?? 0)
    )
      latest.set(key, event);
  }
  const shared = [...latest.values()].filter(({ metadata }) => object(metadata).shared === true);
  const requestIds = [...new Set(shared.map(({ metadata }) => String(object(metadata).threadId)))];
  const rows = requestIds.length
    ? await db.prisma.personalLearningRequest.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          id: { in: requestIds },
        },
        select: {
          id: true,
          revision: true,
          programEnrollmentId: true,
          originalText: true,
          membership: { select: { user: { select: { displayName: true } } } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      })
    : [];
  const active = rows.filter((row) =>
    shared.some(
      (event) =>
        row.id === object(event.metadata).threadId &&
        row.revision === object(event.metadata).requestRevision &&
        row.programEnrollmentId === event.programEnrollmentId,
    ),
  );
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page stack">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>共有された研修の会話</h1>
          <p>
            受講者が明示的に共有した会話だけが表示されます。会話本文を開くと監査ログに記録されます。
          </p>
          <a href={`/s/${serviceSlug}/manage/programs`}>実践プログラムへ戻る</a>
        </header>
        {active.length ? (
          active.map((row) => (
            <section className="card stack" key={`${row.id}:${row.revision}`}>
              <h2>
                {row.membership.user.displayName || '受講者'}（希望の版 {row.revision}）
              </h2>
              <p>{row.originalText}</p>
              <a href={`/s/${serviceSlug}/manage/programs/learning-conversations/${row.id}`}>
                共有会話を開く
              </a>
            </section>
          ))
        ) : (
          <section className="card">
            <p>現在、共有中の会話はありません。</p>
          </section>
        )}
      </main>
    </PublicShell>
  );
}
