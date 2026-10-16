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
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
}) {
  if (!personalLearningRequestEnabled()) notFound();
  const { serviceSlug, programEnrollmentId } = await params;
  const { actor } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/programs/${programEnrollmentId}/learning-request`,
  );
  try {
    const input = await resolvePersonalLearningRequestActor(
      serviceSlug,
      programEnrollmentId,
      actor.userId,
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
    const initial = await new db.PrismaPersonalLearningRequestRepository(db.prisma).readRequest(
      input,
    );
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
        {dynamicMode && <p className="eyebrow">内部テスト中</p>}
        <PersonalLearningRequestCard
          dynamicMode={dynamicMode}
          endpoint={`/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/learning-request`}
          initial={initial}
          practiceEndpoint={`/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/learning-request/practice`}
          initialPractice={await new db.PrismaPersonalLearningPracticeRepository(
            db.prisma,
          ).readPractice(input)}
          candidateEndpoint={`/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/learning-request/candidate`}
          initialCandidate={await new db.PrismaLearningCandidateRepository(db.prisma).readCandidate(
            input,
          )}
          conversationEndpoint={
            dynamicMode && personalLearningFeatureEnabled(program?.settings, 'conversation')
              ? `/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/learning-request/conversation`
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
