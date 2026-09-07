import { getWorkspaceDailyActionAssetResponse } from '../../../../../../../../../src/http/daily-actions';

type Context = {
  params: Promise<{ workspaceId: string; bunshinId: string; dailyActionId: string }>;
};
export async function GET(request: Request, { params }: Context) {
  const { workspaceId, bunshinId, dailyActionId } = await params;
  return getWorkspaceDailyActionAssetResponse(request, workspaceId, bunshinId, dailyActionId);
}
