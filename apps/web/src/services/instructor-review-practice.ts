import 'server-only';

import { ApplicationError } from '@bunshin/shared';
import { resolvePersonalLearningRequestActor } from './personal-learning-request-access';
import { MANABERU_SERVICE_SLUG } from './service-auth-brand';

export async function currentInstructorReviewPractice({
  serviceSlug,
  enrollmentId,
  userId,
  topicId,
}: {
  serviceSlug: string;
  enrollmentId: string;
  userId: string;
  topicId: string | null;
}) {
  if (serviceSlug !== MANABERU_SERVICE_SLUG) {
    throw new ApplicationError('NOT_FOUND', '講師レビューは利用できません');
  }
  const actor = await resolvePersonalLearningRequestActor(
    serviceSlug,
    enrollmentId,
    userId,
    undefined,
    topicId,
  );
  const db = await import('@bunshin/database');
  const state = await new db.PrismaPersonalLearningPracticeRepository(db.prisma).readPractice(
    actor,
  );
  const practice = state.current;
  if (!practice || practice.candidate.proposal.status !== 'READY') {
    throw new ApplicationError('NOT_FOUND', '実践中の課題が見つかりません');
  }
  const latestSubmission = practice.submissions
    .slice()
    .reverse()
    .find((submission) => submission.kind === 'TEXT');
  return {
    actor,
    assignmentId: practice.assignmentId,
    title: practice.candidate.proposal.outcome,
    planRevision: practice.planRevision,
    draft: (practice.note?.text ?? latestSubmission?.content ?? '').slice(0, 8000),
  };
}
