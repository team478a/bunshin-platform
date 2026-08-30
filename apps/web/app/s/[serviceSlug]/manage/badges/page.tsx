import GroupBadgesPage from '../../../../(app)/groups/[groupId]/badges/page';

import { resolvePublicServiceContext } from '../../../../../src/services/public-service';

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
  const service = await resolvePublicServiceContext(serviceSlug);
  return GroupBadgesPage({
    params: Promise.resolve({ groupId: service.serviceId }),
    searchParams: Promise.resolve({ ...(await searchParams), service: service.configuration.slug }),
  });
}
