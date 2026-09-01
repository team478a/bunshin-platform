import { serviceOperationsReportExportResponse } from '../../../../../src/http/service-operations-report-export';

export async function GET(request: Request, context: { params: Promise<{ serviceSlug: string }> }) {
  const { serviceSlug } = await context.params;
  return serviceOperationsReportExportResponse(request, serviceSlug);
}
