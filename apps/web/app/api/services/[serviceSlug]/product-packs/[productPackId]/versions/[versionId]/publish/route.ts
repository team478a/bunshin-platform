import { publishProductPackVersionResponse } from '../../../../../../../../../src/http/product-packs';
import { withServiceContentContext } from '../../../../../../../../../src/http/service-content-context';

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ serviceSlug: string; productPackId: string; versionId: string }> },
) {
  const { serviceSlug, productPackId, versionId } = await params;
  return withServiceContentContext(request, serviceSlug, (service) =>
    publishProductPackVersionResponse(
      request,
      service.workspaceId,
      productPackId,
      versionId,
      service.serviceId,
    ),
  );
}
