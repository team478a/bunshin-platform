import { updateServiceWeeklyReportDeliveryResponse } from '../../../../../src/http/service-weekly-report-delivery';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, context: { params: Promise<{ serviceSlug: string }> }) {
  return updateServiceWeeklyReportDeliveryResponse(request, (await context.params).serviceSlug);
}
