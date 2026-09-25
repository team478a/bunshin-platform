import { loadGroupMembersPage, type GroupMembersSearchParams } from './group-members-data';
import { GroupMembersView } from './group-members-view';

export const dynamic = 'force-dynamic';

export default async function GroupMemberFeaturesPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<GroupMembersSearchParams>;
}) {
  const [{ groupId }, query] = await Promise.all([params, searchParams]);
  const model = await loadGroupMembersPage({ groupId, query });
  return <GroupMembersView model={model} />;
}
