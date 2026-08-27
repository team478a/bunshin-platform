import {
  listVideoAssetsResponse,
  prepareVideoAssetResponse,
} from '../../../../../../../src/http/video-assets';

type Context = { params: Promise<{ workspaceId: string; groupId: string }> };

export async function GET(request: Request, context: Context) {
  const { workspaceId, groupId } = await context.params;
  return listVideoAssetsResponse(request, workspaceId, groupId);
}

export async function POST(request: Request, context: Context) {
  const { workspaceId, groupId } = await context.params;
  return prepareVideoAssetResponse(request, workspaceId, groupId);
}
