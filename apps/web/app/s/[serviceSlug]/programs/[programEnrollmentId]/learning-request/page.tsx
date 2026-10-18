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
import { AiTrainingDataExportCard } from '../ai-training-data-export-card';
import { personalLearningPersonaInvitationAnswerCount } from '../../../../../../src/services/personal-learning-persona-consent';
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
  const { actor, service } = await resolveAuthenticatedMemberServicePage(
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
      { allowUnselectedTopic: true },
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
    const dynamicProgram = personalLearningMode(program?.settings) === 'DYNAMIC_V1';
    const multiTopic = personalLearningFeatureEnabled(program?.settings, 'multiTopic');
    const pagePath = `/s/${serviceSlug}/programs/${programEnrollmentId}/learning-request`;
    const topicEndpoint = `/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/topics`;
    const personaPath = `/s/${serviceSlug}/programs/${programEnrollmentId}/persona`;
    const examplesPath = `/s/${serviceSlug}/programs/${programEnrollmentId}/examples`;
    const personaProfile = dynamicProgram
      ? await new db.PrismaPersonalLearningPersonaRepository(db.prisma).profile(input.scope)
      : null;
    const practiceAnswerCount = dynamicProgram
      ? await db.prisma.trainingMissionAnswer.count({
          where: {
            workspaceId: input.scope.workspaceId,
            groupId: input.scope.groupId,
            programEnrollmentId: input.scope.programEnrollmentId,
            userId: input.scope.userId,
          },
        })
      : 0;
    const showPersonaInvitation =
      dynamicProgram &&
      practiceAnswerCount >= personalLearningPersonaInvitationAnswerCount() &&
      !personaProfile?.optedIn &&
      (!personaProfile?.dismissedUntil || personaProfile.dismissedUntil <= new Date());
    const personaInvitation = showPersonaInvitation ? (
      <section className="service-entry__card" aria-labelledby="persona-invitation-title">
        <h2 id="persona-invitation-title">学び方に合わせたサポートを使いますか？</h2>
        <p>
          実践記録から学び方の傾向を推測します。使うかどうかは自分で選べ、推測はいつでも確認・修正・削除できます。
        </p>
        <a href={personaPath}>内容を確認して選ぶ</a>
      </section>
    ) : null;
    const topics = multiTopic
      ? (
          (await new db.PrismaPersonalLearningTopicRepository(db.prisma).list(input.scope)) ?? []
        ).filter((topic) => topic.status === 'ACTIVE')
      : [];
    if (multiTopic && !input.topicId) {
      return (
        <main style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
          <LearningTopicSelector endpoint={topicEndpoint} pagePath={pagePath} topics={topics} />
          {personaInvitation}
          <p>
            <a href={personaPath}>AIが理解していることを確認・修正する</a>
          </p>
          <p>
            <a href={examplesPath}>保存した活用例・手本を見る</a>
          </p>
        </main>
      );
    }
    const topicQuery = input.topicId ? `?topicId=${encodeURIComponent(input.topicId)}` : '';
    const initial = await new db.PrismaPersonalLearningRequestRepository(db.prisma).readRequest(
      input,
    );
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
        {personaInvitation}
        {multiTopic && (
          <LearningTopicSelector
            endpoint={topicEndpoint}
            pagePath={pagePath}
            topics={topics}
            selectedTopicId={input.topicId}
          />
        )}
        {multiTopic && (
          <>
            <p>
              <a href={personaPath}>AIが理解していることを確認・修正する</a>
            </p>
            <p>
              <a href={examplesPath}>保存した活用例・手本を見る</a>
            </p>
          </>
        )}
        {dynamicProgram && !multiTopic && (
          <p>
            <a href={personaPath}>学び方に合わせたサポートを確認する</a>
          </p>
        )}
        <PersonalLearningRequestCard
          dynamicMode={dynamicProgram}
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
            dynamicProgram && personalLearningFeatureEnabled(program?.settings, 'conversation')
              ? `/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/learning-request/conversation${topicQuery}`
              : undefined
          }
          initialConversation={
            dynamicProgram && personalLearningFeatureEnabled(program?.settings, 'conversation')
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
        {dynamicProgram && (
          <div className="mt-8">
            <AiTrainingDataExportCard
              serviceSlug={serviceSlug}
              programEnrollmentId={programEnrollmentId}
            />
          </div>
        )}
      </main>
    );
  } catch (error) {
    if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
      notFound();
    throw error;
  }
}
