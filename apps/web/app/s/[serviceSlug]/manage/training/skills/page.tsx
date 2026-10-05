import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import {
  listTrainingSupportSkillExposurePilotsForAdmin,
  listTrainingSupportSkillsForAdmin,
} from '../../../../../../src/services/ai-training-skill-lifecycle-admin';
import { resolveManagedServiceContext } from '../../../../../../src/services/public-service';
import { TrainingSupportSkillAdmin } from './training-support-skill-admin';

export const dynamic = 'force-dynamic';

export default async function TrainingSupportSkillAdminPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/training/skills`)}`);
  const service = await resolveManagedServiceContext(
    serviceSlug,
    actor.userId,
    'ADMINISTRATION',
  ).catch(() => null);
  if (!service || !['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(service.serviceRole)) notFound();
  const [skills, exposurePrograms] = await Promise.all([
    listTrainingSupportSkillsForAdmin({
      workspaceId: service.workspaceId,
      serviceId: service.serviceId,
    }),
    listTrainingSupportSkillExposurePilotsForAdmin({
      workspaceId: service.workspaceId,
      serviceId: service.serviceId,
    }),
  ]);
  return (
    <TrainingSupportSkillAdmin
      serviceSlug={serviceSlug}
      initialSkills={skills}
      exposurePrograms={exposurePrograms}
    />
  );
}
