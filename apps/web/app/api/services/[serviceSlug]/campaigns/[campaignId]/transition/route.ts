import { transitionCampaignResponse } from '../../../../../../../src/http/campaigns';
import { resolvePublicServiceContext } from '../../../../../../../src/services/public-service';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; campaignId: string }> },
) {
  const { serviceSlug, campaignId } = await params;
  const service = await resolvePublicServiceContext(serviceSlug);
  return transitionCampaignResponse(request, service.workspaceId, campaignId, service.serviceId);
}
