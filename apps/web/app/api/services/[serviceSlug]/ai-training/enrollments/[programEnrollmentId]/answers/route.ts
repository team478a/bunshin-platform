import { submitAiTrainingAnswerResponse } from '../../../../../../../../../src/http/ai-training-participant';

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await params;
  return submitAiTrainingAnswerResponse(request, serviceSlug, programEnrollmentId);
}
