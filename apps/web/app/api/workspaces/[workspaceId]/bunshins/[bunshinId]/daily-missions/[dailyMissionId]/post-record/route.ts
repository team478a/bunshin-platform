import {
  getPostRecordResponse,
  recordPostResponse,
} from '../../../../../../../../../src/http/mission-outcome';
type Context = {
  params: Promise<{ workspaceId: string; bunshinId: string; dailyMissionId: string }>;
};
export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return getPostRecordResponse(request, value.workspaceId, value.bunshinId, value.dailyMissionId);
}
export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return recordPostResponse(request, value.workspaceId, value.bunshinId, value.dailyMissionId);
}
