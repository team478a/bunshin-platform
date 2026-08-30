import GroupKnowledgePage from '../../../../(app)/groups/[groupId]/knowledge/page';

import { resolvePublicServiceContext } from '../../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export default async function ServiceKnowledgePage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const service = await resolvePublicServiceContext(serviceSlug);
  return GroupKnowledgePage({
    params: Promise.resolve({ groupId: service.serviceId }),
    searchParams: Promise.resolve({ service: service.configuration.slug }),
  });
}
