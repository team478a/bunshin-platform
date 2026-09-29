import {
  createCampaignResponse,
  managedCampaignsResponse,
} from '../../../../../src/http/campaigns';
import { withServiceContentContext } from '../../../../../src/http/service-content-context';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return withServiceContentContext(request, (await params).serviceSlug, (service) =>
    managedCampaignsResponse(request, service.workspaceId, service.serviceId),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return withServiceContentContext(request, (await params).serviceSlug, (service) =>
    createCampaignResponse(request, service.workspaceId, service.serviceId),
  );
}
