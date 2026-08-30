import GroupMemberFeaturesPage from '../../../../(app)/groups/[groupId]/members/page';
import { redirect } from 'next/navigation';

import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';

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
    staffSaved?: string;
    approved?: string;
    error?: string;
  }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/members`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
  return GroupMemberFeaturesPage({
    params: Promise.resolve({ groupId: service.serviceId }),
    searchParams: Promise.resolve({ ...(await searchParams), service: service.configuration.slug }),
  });
}
