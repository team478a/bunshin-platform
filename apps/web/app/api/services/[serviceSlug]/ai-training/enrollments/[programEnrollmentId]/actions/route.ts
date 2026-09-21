import { recordAiTrainingInteractionResponse } from '../../../../../../../../src/http/ai-training-participant';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return recordAiTrainingInteractionResponse(request, serviceSlug, programEnrollmentId);
}
