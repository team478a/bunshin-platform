import { assignProductPackResponse } from '../../../../../../../src/http/product-packs';
export function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; productPackId: string }> },
) {
  return params.then(({ workspaceId, productPackId }) =>
    assignProductPackResponse(request, workspaceId, productPackId),
  );
}
