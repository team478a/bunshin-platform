import GroupBadgesPage from '../../../../(app)/groups/[groupId]/badges/page';
import { redirect } from 'next/navigation';

import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export default async function ServiceBadgesPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{
    created?: string;
    nominated?: string;
    reviewed?: string;
    error?: string;
  }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/badges`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
  return GroupBadgesPage({
    params: Promise.resolve({ groupId: service.serviceId }),
    searchParams: Promise.resolve({ ...(await searchParams), service: service.configuration.slug }),
  });
}
