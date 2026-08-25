import { decideCampaignResponse } from '../../../../../../../../../src/http/campaigns';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string; campaignId: string }> };

export async function POST(request: Request, context: Context) {
  const params = await context.params;
  return decideCampaignResponse(request, params.workspaceId, params.bunshinId, params.campaignId);
}
