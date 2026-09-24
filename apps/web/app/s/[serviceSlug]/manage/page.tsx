import { loadServiceManagementHome } from './service-management-home-data';
import { ServiceManagementHomeView } from './service-management-home-view';

export const dynamic = 'force-dynamic';

export default async function ServiceManagementHome({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const model = await loadServiceManagementHome(serviceSlug);
  return <ServiceManagementHomeView model={model} />;
}
