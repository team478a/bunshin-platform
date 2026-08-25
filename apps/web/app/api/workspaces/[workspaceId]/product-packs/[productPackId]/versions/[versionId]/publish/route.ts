import { publishProductPackVersionResponse } from '../../../../../../../../../src/http/product-packs';
export function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ workspaceId: string; productPackId: string; versionId: string }> },
) {
  return params.then(({ workspaceId, productPackId, versionId }) =>
    publishProductPackVersionResponse(request, workspaceId, productPackId, versionId),
  );
}
