import { learningPracticeSupportResponse } from '../../../../../../../../../../src/http/personal-learning-practice-support';
export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return learningPracticeSupportResponse(request, serviceSlug, programEnrollmentId);
}
