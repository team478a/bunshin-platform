import {
  listMissionActivitiesResponse,
  recordMissionActivityResponse,
} from '../../../../../../../../../src/http/mission-engagement';

type Context = {
  params: Promise<{ workspaceId: string; bunshinId: string; dailyMissionId: string }>;
};
export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return listMissionActivitiesResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.dailyMissionId,
  );
}
export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return recordMissionActivityResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.dailyMissionId,
  );
}
