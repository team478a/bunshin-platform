import { getAiTrainingCurrentMissionResponse } from '../../../../../../../../src/http/ai-training-participant';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await params;
  return getAiTrainingCurrentMissionResponse(request, serviceSlug, programEnrollmentId);
}
