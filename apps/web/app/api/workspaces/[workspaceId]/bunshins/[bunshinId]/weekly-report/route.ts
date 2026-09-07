import { getWorkspaceWeeklyActivityReportResponse } from '../../../../../../../src/http/weekly-activity-reports';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { workspaceId, bunshinId } = await params;
  return getWorkspaceWeeklyActivityReportResponse(request, workspaceId, bunshinId);
}
