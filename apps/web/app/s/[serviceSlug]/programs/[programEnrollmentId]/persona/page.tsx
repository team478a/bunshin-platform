import { notFound } from 'next/navigation';
import type { PrismaClient } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import { resolveAuthenticatedMemberServicePage } from '../../../../../../src/services/member-service-page';
import { resolvePersonalLearningRequestActor } from '../../../../../../src/services/personal-learning-request-access';
import { PrismaPersonalLearningPersonaRepository, prisma } from '@bunshin/database';
import { PersonalLearningPersonaCard } from './persona-card';

export const dynamic = 'force-dynamic';

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function evidenceHref(
  db: { prisma: PrismaClient },
  scope: {
    workspaceId: string;
    groupId: string;
    programEnrollmentId: string;
    groupMembershipId: string;
    userId: string;
  },
  serviceSlug: string,
  item: { evidenceType: string; evidenceId: string },
) {
  let topicId: string | null = null;
  if (item.evidenceType === 'LEARNING_REQUEST') {
    const request = await db.prisma.personalLearningRequest.findFirst({
      where: { ...scope, id: item.evidenceId },
      select: { topicId: true },
    });
    topicId = request?.topicId ?? null;
  } else if (item.evidenceType === 'CONVERSATION_EVENT') {
    const event = await db.prisma.programActionEvent.findFirst({
      where: {
        id: item.evidenceId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: scope.programEnrollmentId,
        actorUserId: scope.userId,
        eventType: {
          in: ['PERSONAL_LEARNING_CONVERSATION_MESSAGE', 'PERSONAL_LEARNING_CONVERSATION_RESPONSE'],
        },
      },
      select: { metadata: true },
    });
    const rawTopic = jsonObject(event?.metadata)['topicId'];
    topicId = typeof rawTopic === 'string' ? rawTopic : null;
  } else if (item.evidenceType === 'PRACTICE_ANSWER') {
    const answer = await db.prisma.trainingMissionAnswer.findFirst({
      where: {
        id: item.evidenceId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: scope.programEnrollmentId,
        userId: scope.userId,
      },
      select: { missionAssignmentId: true },
    });
    if (answer) {
      const started = await db.prisma.programActionEvent.findFirst({
        where: {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          programEnrollmentId: scope.programEnrollmentId,
          missionAssignmentId: answer.missionAssignmentId,
          actorUserId: scope.userId,
          eventType: 'PERSONAL_LEARNING_PRACTICE_STARTED',
        },
        select: { metadata: true },
      });
      const rawTopic = jsonObject(started?.metadata)['topicId'];
      topicId = typeof rawTopic === 'string' ? rawTopic : null;
    }
  }
  const base = `/s/${serviceSlug}/programs/${scope.programEnrollmentId}/learning-request`;
  const section =
    item.evidenceType === 'LEARNING_REQUEST'
      ? 'learning-request-record'
      : item.evidenceType === 'CONVERSATION_EVENT'
        ? 'conversation-record'
        : 'practice-record';
  return topicId ? `${base}?topicId=${encodeURIComponent(topicId)}#${section}` : null;
}

export default async function PersonalLearningPersonaPage({
  params,
}: {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
}) {
  const { serviceSlug, programEnrollmentId } = await params;
  const { actor } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/programs/${programEnrollmentId}/persona`,
  );
  try {
    const scoped = await resolvePersonalLearningRequestActor(
      serviceSlug,
      programEnrollmentId,
      actor.userId,
      'multiTopic',
      undefined,
      { allowUnselectedTopic: true },
    );
    const db = await import('@bunshin/database');
    const repository = new PrismaPersonalLearningPersonaRepository(prisma);
    const items = await repository.list(scoped.scope);
    const viewItems = await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        attributeKey: item.attributeKey,
        value: item.value,
        status: item.status,
        evidenceType: item.evidenceType,
        evidenceId: item.evidenceId,
        evidenceCreatedAt: item.evidenceCreatedAt.toISOString(),
        evidenceHref: await evidenceHref(db, scoped.scope, serviceSlug, item),
      })),
    );
    return (
      <main className="service-entry resale-action-page training-page" style={{ maxWidth: 640 }}>
        <header className="service-entry__header">
          <p className="eyebrow">マナベルスタイル</p>
          <h1>あなたについてのAIの理解</h1>
          <p>学習記録からAIが推測した内容です。確認・修正・削除はいつでもできます。</p>
        </header>
        <PersonalLearningPersonaCard
          serviceSlug={serviceSlug}
          enrollmentId={programEnrollmentId}
          initialItems={viewItems}
        />
        <a
          className="button button--secondary button--full"
          href={`/s/${serviceSlug}/programs/${programEnrollmentId}/learning-request`}
        >
          学習画面へ戻る
        </a>
      </main>
    );
  } catch (error) {
    if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
      notFound();
    throw error;
  }
}
