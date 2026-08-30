import { publishProductPackVersionResponse } from '../../../../../../../../../src/http/product-packs';
import { resolvePublicServiceContext } from '../../../../../../../../../src/services/public-service';

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ serviceSlug: string; productPackId: string; versionId: string }> },
) {
  const { serviceSlug, productPackId, versionId } = await params;
  const service = await resolvePublicServiceContext(serviceSlug);
  return publishProductPackVersionResponse(
    request,
    service.workspaceId,
    productPackId,
    versionId,
    service.serviceId,
  );
}
