import { notFound } from 'next/navigation';
import { ApplicationError } from '@bunshin/shared';
import { resolveAuthenticatedMemberServicePage } from '../../../../../../src/services/member-service-page';
import {
  resolvePersonalLearningRequestActor,
  personalLearningRequestEnabled,
} from '../../../../../../src/services/personal-learning-request-access';
import { PersonalLearningRequestCard } from './card';
import { personalLearningMode, personalLearningOfferPolicy } from '@bunshin/capability-training';
import { personalLearningFeatureEnabled } from '@bunshin/capability-training';
import { LearningTopicSelector } from './topic-selector';
import { AiTrainingDataExportCard } from '../ai-training-data-export-card';
import { personalLearningPersonaInvitationAnswerCount } from '../../../../../../src/services/personal-learning-persona-consent';
import { LearningNudgePreferenceCard } from './nudge-preference-card';
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
    let input = await resolvePersonalLearningRequestActor(
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
    const sideHustle =
      personalLearningOfferPolicy(program?.settings) === 'SIDE_HUSTLE_V1'
        ? await new db.PrismaSideHustleHearingRepository(db.prisma).readState({
            actorUserId: input.actorUserId,
            scope: input.scope,
          })
        : null;
    const sideHustleProgram = personalLearningOfferPolicy(program?.settings) === 'SIDE_HUSTLE_V1';
    if (sideHustleProgram && !sideHustle?.started) {
      const candidate = sideHustle?.selection?.candidate as { name?: unknown } | undefined;
      return (
        <main style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
          <section className="service-entry__card" aria-label="副業の選択">
            {typeof candidate?.name === 'string' ? (
              <>
                <h2>選んだ副業：{candidate.name}</h2>
                <a href={`/s/${serviceSlug}/programs/${programEnrollmentId}/side-hustle`}>
                  副業の選択を確認する
                </a>
              </>
            ) : (
              <>
                <h2>まず、あなたに合う副業を一緒に選びましょう</h2>
                <a href={`/s/${serviceSlug}/programs/${programEnrollmentId}/side-hustle`}>
                  副業を選ぶ
                </a>
              </>
            )}
          </section>
        </main>
      );
    }
    if (sideHustleProgram && sideHustle?.started && !selectedTopicId) {
      input = await resolvePersonalLearningRequestActor(
        serviceSlug,
        programEnrollmentId,
        actor.userId,
        undefined,
        sideHustle.started.topicId,
      );
    }
    const sideHustlePath = `/s/${serviceSlug}/programs/${programEnrollmentId}/side-hustle`;
    const selectedCandidate = sideHustle?.selection?.candidate as { name?: unknown } | undefined;
    const sideHustleEntry = sideHustle ? (
      <section className="service-entry__card" aria-label="副業の選択">
        {typeof selectedCandidate?.name === 'string' ? (
          <>
            <h2>選んだ副業：{selectedCandidate.name}</h2>
            <a href={sideHustlePath}>副業の選択を確認する</a>
          </>
        ) : (
          <>
            <h2>まず、あなたに合う副業を一緒に選びましょう</h2>
            <a href={sideHustlePath}>副業を選ぶ</a>
          </>
        )}
      </section>
    ) : null;
    const multiTopic = personalLearningFeatureEnabled(program?.settings, 'multiTopic');
    const pagePath = `/s/${serviceSlug}/programs/${programEnrollmentId}/learning-request`;
    const topicEndpoint = `/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/topics`;
    const personaPath = `/s/${serviceSlug}/programs/${programEnrollmentId}/persona`;
    const examplesPath = `/s/${serviceSlug}/programs/${programEnrollmentId}/examples`;
    const personaProfile = dynamicProgram
      ? await new db.PrismaPersonalLearningPersonaRepository(db.prisma).profile(input.scope)
      : null;
    const nudgePreference = dynamicProgram
      ? await new db.PrismaPersonalLearningNudgePreferenceRepository(db.prisma).read(input)
      : null;
    const nudgeFeatureEnabled = personalLearningFeatureEnabled(program?.settings, 'learningNudges');
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
    const selectedTopic =
      sideHustleProgram && input.topicId
        ? await db.prisma.personalLearningTopic.findFirst({
            where: { ...input.scope, id: input.topicId },
            select: { id: true, title: true, goalSnapshot: true },
          })
        : null;
    const goalSnapshot = selectedTopic?.goalSnapshot;
    const sideHustleGoal =
      goalSnapshot &&
      typeof goalSnapshot === 'object' &&
      !Array.isArray(goalSnapshot) &&
      (goalSnapshot as Record<string, unknown>)['kind'] === 'SIDE_HUSTLE'
        ? (goalSnapshot as Record<string, unknown>)
        : null;
    const roadmap = sideHustleGoal?.['roadmap'] as
      { milestones?: readonly { period: string; title: string; outcome: string }[] } | undefined;
    const roadmapCard =
      sideHustleGoal && roadmap?.milestones?.length === 3 ? (
        <section className="service-entry__card" aria-label="90日の地図">
          <h2>90日の地図：{selectedTopic?.title}</h2>
          <p>いまは1か月目「{roadmap.milestones[0]?.title}」です</p>
          {roadmap.milestones.map((milestone, index) => (
            <p key={milestone.period}>
              {index + 1}か月目：{milestone.title}（{milestone.outcome}）
            </p>
          ))}
          <a href={`/s/${serviceSlug}/programs/${programEnrollmentId}/side-hustle`}>地図を見る</a>
        </section>
      ) : null;
    if (multiTopic && !input.topicId) {
      return (
        <main style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
          {sideHustleEntry}
          <LearningTopicSelector
            endpoint={topicEndpoint}
            pagePath={pagePath}
            topics={topics}
            allowCreate={!sideHustleProgram}
          />
          {dynamicProgram && (
            <LearningNudgePreferenceCard
              endpoint={`/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/personal-learning/nudge-preference`}
              initial={{
                enabled: nudgePreference?.enabled ?? true,
                consented: true,
                pausedUntil: nudgePreference?.pausedUntil?.toISOString() ?? null,
                stoppedAt: nudgePreference?.stoppedAt?.toISOString() ?? null,
                featureEnabled: nudgeFeatureEnabled,
              }}
            />
          )}
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
        {sideHustleEntry}
        {roadmapCard}
        {personaInvitation}
        {dynamicProgram && (
          <LearningNudgePreferenceCard
            endpoint={`/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/personal-learning/nudge-preference`}
            initial={{
              enabled: nudgePreference?.enabled ?? true,
              consented: true,
              pausedUntil: nudgePreference?.pausedUntil?.toISOString() ?? null,
              stoppedAt: nudgePreference?.stoppedAt?.toISOString() ?? null,
              featureEnabled: nudgeFeatureEnabled,
            }}
          />
        )}
        {multiTopic && (
          <LearningTopicSelector
            endpoint={topicEndpoint}
            pagePath={pagePath}
            topics={topics}
            selectedTopicId={input.topicId}
            allowCreate={!sideHustleProgram}
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
