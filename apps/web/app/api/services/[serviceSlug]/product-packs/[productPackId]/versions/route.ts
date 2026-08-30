import { createProductPackVersionResponse } from '../../../../../../../src/http/product-packs';
import { resolvePublicServiceContext } from '../../../../../../../src/services/public-service';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; productPackId: string }> },
) {
  const { serviceSlug, productPackId } = await params;
  const service = await resolvePublicServiceContext(serviceSlug);
  return createProductPackVersionResponse(
    request,
    service.workspaceId,
    productPackId,
    service.serviceId,
  );
}
