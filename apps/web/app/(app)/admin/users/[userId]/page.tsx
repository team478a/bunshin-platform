import { loadAdminUserDetailPageData } from './admin-user-detail-data';
import { AdminUserDetailView } from './admin-user-detail-view';

export const dynamic = 'force-dynamic';

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  const data = await loadAdminUserDetailPageData(userId);

  return <AdminUserDetailView data={data} query={query} />;
}
