import { notFound } from 'next/navigation';
import { personalLearningOfferPolicy } from '@bunshin/capability-training';
import { resolveAuthenticatedMemberServicePage } from '../../../../../../src/services/member-service-page';
import { resolvePersonalLearningRequestActor } from '../../../../../../src/services/personal-learning-request-access';
import SideHustleClient from './client';

export const dynamic = 'force-dynamic';

export default async function SideHustlePage({
  params,
}: {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
}) {
  const { serviceSlug, programEnrollmentId } = await params;
  const { actor } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/programs/${programEnrollmentId}/side-hustle`,
  );
  const input = await resolvePersonalLearningRequestActor(
    serviceSlug,
    programEnrollmentId,
    actor.userId,
    undefined,
    undefined,
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
  if (personalLearningOfferPolicy(program?.settings) !== 'SIDE_HUSTLE_V1') notFound();
  return <SideHustleClient serviceSlug={serviceSlug} programEnrollmentId={programEnrollmentId} />;
}
