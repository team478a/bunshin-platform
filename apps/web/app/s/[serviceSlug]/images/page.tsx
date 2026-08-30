import GroupImagesPage from '../../../(app)/groups/[groupId]/images/page';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export default async function ServiceImagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ mission?: string }>;
}) {
  const { serviceSlug } = await params;
  const service = await resolvePublicServiceContext(serviceSlug);
  return GroupImagesPage({
    params: Promise.resolve({ groupId: service.serviceId }),
    searchParams: Promise.resolve({ ...(await searchParams), service: service.configuration.slug }),
  });
}
