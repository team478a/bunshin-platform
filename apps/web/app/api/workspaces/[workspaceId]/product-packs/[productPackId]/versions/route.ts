import { createProductPackVersionResponse } from '../../../../../../../src/http/product-packs';
export function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; productPackId: string }> },
) {
  return params.then(({ workspaceId, productPackId }) =>
    createProductPackVersionResponse(request, workspaceId, productPackId),
  );
}
