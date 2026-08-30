import GroupVideosPage from '../../../(app)/groups/[groupId]/videos/page';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export default async function ServiceVideosPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const service = await resolvePublicServiceContext(serviceSlug);
  return GroupVideosPage({
    params: Promise.resolve({ groupId: service.serviceId }),
    searchParams: Promise.resolve({ service: service.configuration.slug }),
  });
}
