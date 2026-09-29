import { trainingEndDateResponse } from '../../../../../../../../src/http/ai-training-end-date';

export async function POST(
  request: Request,
  context: {
    params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
  },
) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return trainingEndDateResponse(request, serviceSlug, programEnrollmentId);
}
