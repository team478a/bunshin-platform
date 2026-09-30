import { createProductPackVersionResponse } from '../../../../../../../src/http/product-packs';
import { withServiceContentContext } from '../../../../../../../src/http/service-content-context';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; productPackId: string }> },
) {
  const { serviceSlug, productPackId } = await params;
  return withServiceContentContext(request, serviceSlug, (service) =>
    createProductPackVersionResponse(
      request,
      service.workspaceId,
      productPackId,
      service.serviceId,
    ),
  );
}
