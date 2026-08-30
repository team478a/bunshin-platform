import GroupMemberFeaturesPage from '../../../../(app)/groups/[groupId]/members/page';

import { resolvePublicServiceContext } from '../../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export default async function ServiceMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{
    member?: string;
    saved?: string;
    memberSaved?: string;
    approved?: string;
    error?: string;
  }>;
}) {
  const { serviceSlug } = await params;
  const service = await resolvePublicServiceContext(serviceSlug);
  return GroupMemberFeaturesPage({
    params: Promise.resolve({ groupId: service.serviceId }),
    searchParams: Promise.resolve({ ...(await searchParams), service: service.configuration.slug }),
  });
}
