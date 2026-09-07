import {
  createWorkspaceDailyActionResponse,
  listWorkspaceDailyActionsResponse,
} from '../../../../../../../src/http/daily-actions';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };
export async function GET(request: Request, { params }: Context) {
  const { workspaceId, bunshinId } = await params;
  return listWorkspaceDailyActionsResponse(request, workspaceId, bunshinId);
}
export async function POST(request: Request, { params }: Context) {
  const { workspaceId, bunshinId } = await params;
  return createWorkspaceDailyActionResponse(request, workspaceId, bunshinId);
}
