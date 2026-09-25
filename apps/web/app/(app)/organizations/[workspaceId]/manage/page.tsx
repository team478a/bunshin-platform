import {
  loadOrganizationManagePage,
  type OrganizationManageSearchParams,
} from './organization-manage-data';
import { OrganizationManageView } from './organization-manage-view';

export const dynamic = 'force-dynamic';

export default async function OrganizationManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<OrganizationManageSearchParams>;
}) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  const model = await loadOrganizationManagePage({ workspaceId, query });
  return <OrganizationManageView model={model} />;
}
