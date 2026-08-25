import { availableCampaignsResponse } from '../../../../../../../src/http/campaigns';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };

export async function GET(request: Request, context: Context) {
  const params = await context.params;
  return availableCampaignsResponse(request, params.workspaceId, params.bunshinId);
}
