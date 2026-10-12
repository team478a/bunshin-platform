import { notFound } from 'next/navigation';
import { ApplicationError } from '@bunshin/shared';
import { resolveAuthenticatedMemberServicePage } from '../../../../../../src/services/member-service-page';
import {
  resolvePersonalLearningRequestActor,
  personalLearningRequestEnabled,
} from '../../../../../../src/services/personal-learning-request-access';
import { PersonalLearningRequestCard } from './card';
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
    const initial = await new db.PrismaPersonalLearningRequestRepository(db.prisma).readRequest(
      input,
    );
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
        <PersonalLearningRequestCard
          endpoint={`/api/services/${serviceSlug}/ai-training/enrollments/${programEnrollmentId}/learning-request`}
          initial={initial}
        />
      </main>
    );
  } catch (error) {
    if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
      notFound();
    throw error;
  }
}
