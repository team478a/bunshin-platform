import { transitionCampaignResponse } from '../../../../../../../src/http/campaigns';
import { withServiceContentContext } from '../../../../../../../src/http/service-content-context';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; campaignId: string }> },
) {
  const { serviceSlug, campaignId } = await params;
  return withServiceContentContext(request, serviceSlug, (service) =>
    transitionCampaignResponse(request, service.workspaceId, campaignId, service.serviceId),
  );
}
