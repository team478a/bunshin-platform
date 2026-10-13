import { learningPracticeSupportImageResponse } from '../../../../../../../../../../../../src/http/personal-learning-practice-support';

export async function GET(
  request: Request,
  context: {
    params: Promise<{ serviceSlug: string; programEnrollmentId: string; requestId: string }>;
  },
) {
  const { serviceSlug, programEnrollmentId, requestId } = await context.params;
  return learningPracticeSupportImageResponse(request, serviceSlug, programEnrollmentId, requestId);
}
