import {
  evaluateAiTrainingAnswerResponse,
  getAiTrainingEvaluationResponse,
} from '../../../../../../../../../../src/http/ai-training-evaluation';

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ serviceSlug: string; programEnrollmentId: string; answerId: string }> },
) {
  const { serviceSlug, programEnrollmentId, answerId } = await params;
  return evaluateAiTrainingAnswerResponse(request, serviceSlug, programEnrollmentId, answerId);
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{ serviceSlug: string; programEnrollmentId: string; answerId: string }>;
  },
) {
  const { serviceSlug, programEnrollmentId, answerId } = await context.params;
  return getAiTrainingEvaluationResponse(request, serviceSlug, programEnrollmentId, answerId);
}
