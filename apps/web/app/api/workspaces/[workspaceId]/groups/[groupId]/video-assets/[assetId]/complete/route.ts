import { completeVideoAssetResponse } from '../../../../../../../../../src/http/video-assets';

type Context = { params: Promise<{ workspaceId: string; groupId: string; assetId: string }> };

export async function POST(request: Request, context: Context) {
  const { workspaceId, groupId, assetId } = await context.params;
  return completeVideoAssetResponse(request, workspaceId, groupId, assetId);
}
