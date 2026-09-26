import { loadGroupBadgesPage, type GroupBadgesSearchParams } from './group-badges-data';
import { GroupBadgesView } from './group-badges-view';

export const dynamic = 'force-dynamic';

export default async function GroupBadgesPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<GroupBadgesSearchParams>;
}) {
  const [{ groupId }, query] = await Promise.all([params, searchParams]);
  const model = await loadGroupBadgesPage({ groupId, query });
  return <GroupBadgesView model={model} />;
}
