import {
  listExternalLinkPlacementsResponse,
  upsertExternalLinkPlacementResponse,
} from '../../../../../../src/http/external-tracking-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  const { workspaceId } = await context.params;
  return listExternalLinkPlacementsResponse(request, workspaceId);
}

export async function PUT(request: Request, context: Context) {
  const { workspaceId } = await context.params;
  return upsertExternalLinkPlacementResponse(request, workspaceId);
}
