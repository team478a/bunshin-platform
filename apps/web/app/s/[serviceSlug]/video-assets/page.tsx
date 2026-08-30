import GroupVideoAssetsPage from '../../../(app)/groups/[groupId]/video-assets/page';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export default async function ServiceVideoAssetsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const service = await resolvePublicServiceContext(serviceSlug);
  return GroupVideoAssetsPage({
    params: Promise.resolve({ groupId: service.serviceId }),
    searchParams: Promise.resolve({ service: service.configuration.slug }),
  });
}
