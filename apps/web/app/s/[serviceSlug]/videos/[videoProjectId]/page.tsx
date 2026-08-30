import GroupVideoProjectPage from '../../../../(app)/groups/[groupId]/videos/[videoProjectId]/page';
import { resolvePublicServiceContext } from '../../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export default async function ServiceVideoProjectPage({
  params,
}: {
  params: Promise<{ serviceSlug: string; videoProjectId: string }>;
}) {
  const { serviceSlug, videoProjectId } = await params;
  const service = await resolvePublicServiceContext(serviceSlug);
  return GroupVideoProjectPage({
    params: Promise.resolve({ groupId: service.serviceId, videoProjectId }),
    searchParams: Promise.resolve({ service: service.configuration.slug }),
  });
}
