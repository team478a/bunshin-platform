import { notFound, redirect } from 'next/navigation';
import { ApplicationError } from '@bunshin/shared';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { loadTrainingEnrollmentExpiryAdminPreview } from '../../../../../../src/services/ai-training-enrollment-expiry-admin';
import { resolveManagedServiceContext } from '../../../../../../src/services/public-service';
import { PublicShell } from '../../../../../ui/public-shell';
import { TrainingEnrollmentExpirySummary } from './expiry-summary';

export const dynamic = 'force-dynamic';

export default async function TrainingEnrollmentExpiryPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/training/expiry`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(
    (error: unknown) => {
      if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
        notFound();
      if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND') notFound();
      throw error;
    },
  );
  if (!service) notFound();
  const checkedAt = new Date();
  const result = await loadTrainingEnrollmentExpiryAdminPreview({
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
    now: checkedAt,
  });
  if (result.outcome === 'FORBIDDEN') notFound();
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page training-admin">
        <TrainingEnrollmentExpirySummary
          serviceSlug={serviceSlug}
          checkedAt={checkedAt}
          result={result}
        />
      </main>
    </PublicShell>
  );
}
