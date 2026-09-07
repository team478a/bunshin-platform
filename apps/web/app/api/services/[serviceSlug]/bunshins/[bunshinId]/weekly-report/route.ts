import { getServiceWeeklyActivityReportResponse } from '../../../../../../../src/http/weekly-activity-reports';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId } = await params;
  return getServiceWeeklyActivityReportResponse(request, serviceSlug, bunshinId);
}
