import GroupKnowledgePage from '../../../../(app)/groups/[groupId]/knowledge/page';
import { redirect } from 'next/navigation';

import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export default async function ServiceKnowledgePage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/knowledge`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
  return GroupKnowledgePage({
    params: Promise.resolve({ groupId: service.serviceId }),
    searchParams: Promise.resolve({ service: service.configuration.slug }),
  });
}
