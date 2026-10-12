import { serviceOverviewResponse } from '../../../../../src/http/service-improvement-overview';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ serviceSlug: string }> }) {
  return serviceOverviewResponse(request, (await context.params).serviceSlug);
}
