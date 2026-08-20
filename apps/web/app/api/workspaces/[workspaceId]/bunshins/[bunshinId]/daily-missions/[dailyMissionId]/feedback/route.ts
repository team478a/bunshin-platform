import {
  getMissionFeedbackResponse,
  recordMissionFeedbackResponse,
} from '../../../../../../../../../src/http/mission-outcome';
type Context = {
  params: Promise<{ workspaceId: string; bunshinId: string; dailyMissionId: string }>;
};
export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return getMissionFeedbackResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.dailyMissionId,
  );
}
export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return recordMissionFeedbackResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.dailyMissionId,
  );
}
