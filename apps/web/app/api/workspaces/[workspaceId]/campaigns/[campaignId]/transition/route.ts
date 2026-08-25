import { transitionCampaignResponse } from '../../../../../../../src/http/campaigns';

type Context = { params: Promise<{ workspaceId: string; campaignId: string }> };

export async function POST(request: Request, context: Context) {
  const params = await context.params;
  return transitionCampaignResponse(request, params.workspaceId, params.campaignId);
}
