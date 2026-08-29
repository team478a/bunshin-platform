import { getBadgeDashboardResponse } from '../../../../../src/http/badge-user-experience';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return getBadgeDashboardResponse(request, (await params).workspaceId);
}
