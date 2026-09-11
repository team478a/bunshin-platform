import { serviceRewardExportResponse } from '../../../../../src/http/service-reward-export';

export async function GET(request: Request, context: { params: Promise<{ serviceSlug: string }> }) {
  const { serviceSlug } = await context.params;
  return serviceRewardExportResponse(request, serviceSlug);
}
