import { learningPracticeResponse } from '../../../../../../../../../src/http/personal-learning-practice';
export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
  },
) {
  const { serviceSlug, programEnrollmentId } = await params;
  return learningPracticeResponse(request, serviceSlug, programEnrollmentId);
}
export const POST = GET;
