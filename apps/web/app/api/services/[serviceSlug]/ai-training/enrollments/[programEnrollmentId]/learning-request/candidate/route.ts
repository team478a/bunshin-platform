import { learningCandidateResponse } from '../../../../../../../../../src/http/personal-learning-lesson-candidate';
export async function GET(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const p = await context.params;
  return learningCandidateResponse(request, p.serviceSlug, p.programEnrollmentId);
}
export const POST = GET;
