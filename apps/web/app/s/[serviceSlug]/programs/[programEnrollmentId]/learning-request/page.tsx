import { notFound } from 'next/navigation';
import { ApplicationError } from '@bunshin/shared';
import { resolveAuthenticatedMemberServicePage } from '../../../../../../src/services/member-service-page';
import {
  resolvePersonalLearningRequestActor,
  personalLearningRequestEnabled,
} from '../../../../../../src/services/personal-learning-request-access';
import { PersonalLearningRequestCard } from './card';
import { personalLearningMode } from '@bunshin/capability-training';
import { personalLearningFeatureEnabled } from '@bunshin/capability-training';
import { LearningTopicSelector } from './topic-selector';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
  searchParams: Promise<{ topicId?: string }>;
}) {
  if (!personalLearningRequestEnabled()) notFound();
  const { serviceSlug, programEnrollmentId } = await params;
  const { topicId: selectedTopicId } = await searchParams;
  const { actor } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/programs/${programEnrollmentId}/learning-request`,
  );
  try {
    const input = await resolvePersonalLearningRequestActor(
      serviceSlug,
      programEnrollmentId,
      actor.userId,
      undefined,
      selectedTopicId,
    );
    const db = await import('@bunshin/database');
    const enrollment = await db.prisma.programEnrollment.findFirst({
      where: {
        id: input.scope.programEnrollmentId,
        workspaceId: input.scope.workspaceId,
        groupId: input.scope.groupId,
      },
      select: { serviceProgramId: true },
    });
    const program = enrollment
      ? await db.prisma.serviceProgram.findFirst({
          where: {
            id: enrollment.serviceProgramId,
            workspaceId: input.scope.workspaceId,
            groupId: input.scope.groupId,
          },
          select: { settings: true },
        })
      : null;
    const dynamicMode = personalLearningMode(program?.settings) === 'DYNAMIC_V1';
    const multiTopic = personalLearningFeatureEnabled(program?.settings, 'multiTopic');
    const pagePath = `/s/${serviceSlug}/programs/${programEnrollmentId}/learning-request`;
    const topicEndpoint = `/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/topics`;
    const topics = multiTopic
      ? (
          (await new db.PrismaPersonalLearningTopicRepository(db.prisma).list(input.scope)) ?? []
        ).filter((topic) => topic.status === 'ACTIVE')
      : [];
    if (multiTopic && !input.topicId) {
      return (
        <main style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
          <LearningTopicSelector endpoint={topicEndpoint} pagePath={pagePath} topics={topics} />
        </main>
      );
    }
    const topicQuery = input.topicId ? `?topicId=${encodeURIComponent(input.topicId)}` : '';
    const initial = await new db.PrismaPersonalLearningRequestRepository(db.prisma).readRequest(
      input,
    );
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
        {dynamicMode && <p className="eyebrow">内部テスト中</p>}
        {multiTopic && (
          <LearningTopicSelector
            endpoint={topicEndpoint}
            pagePath={pagePath}
            topics={topics}
            selectedTopicId={input.topicId}
          />
        )}
        <PersonalLearningRequestCard
          dynamicMode={dynamicMode}
          endpoint={`/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/learning-request${topicQuery}`}
          initial={initial}
          practiceEndpoint={`/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/learning-request/practice${topicQuery}`}
          initialPractice={await new db.PrismaPersonalLearningPracticeRepository(
            db.prisma,
          ).readPractice(input)}
          candidateEndpoint={`/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/learning-request/candidate${topicQuery}`}
          initialCandidate={await new db.PrismaLearningCandidateRepository(db.prisma).readCandidate(
            input,
          )}
          conversationEndpoint={
            dynamicMode && personalLearningFeatureEnabled(program?.settings, 'conversation')
              ? `/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/learning-request/conversation${topicQuery}`
              : undefined
          }
          initialConversation={
            dynamicMode && personalLearningFeatureEnabled(program?.settings, 'conversation')
              ? await new db.PrismaPersonalLearningConversationRepository(
                  db.prisma,
                ).readConversation(
                  await resolvePersonalLearningRequestActor(
                    serviceSlug,
                    programEnrollmentId,
                    actor.userId,
                    'conversation',
                    input.topicId,
                  ),
                )
              : null
          }
        />
      </main>
    );
  } catch (error) {
    if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
      notFound();
    throw error;
  }
}
