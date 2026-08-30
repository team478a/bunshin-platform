import {
  createCampaignResponse,
  managedCampaignsResponse,
} from '../../../../../src/http/campaigns';
import { resolvePublicServiceContext } from '../../../../../src/services/public-service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  const service = await resolvePublicServiceContext((await params).serviceSlug);
  return managedCampaignsResponse(request, service.workspaceId, service.serviceId);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  const service = await resolvePublicServiceContext((await params).serviceSlug);
  return createCampaignResponse(request, service.workspaceId, service.serviceId);
}
