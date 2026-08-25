import {
  createCampaignResponse,
  managedCampaignsResponse,
} from '../../../../../src/http/campaigns';

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  return managedCampaignsResponse(request, (await context.params).workspaceId);
}

export async function POST(request: Request, context: Context) {
  return createCampaignResponse(request, (await context.params).workspaceId);
}
