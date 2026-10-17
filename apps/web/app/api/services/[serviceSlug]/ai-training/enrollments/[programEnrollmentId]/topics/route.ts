import { personalLearningTopicsResponse } from '../../../../../../../../src/http/personal-learning-topics';
export const dynamic = 'force-dynamic';
async function respond(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const params = await context.params;
  return personalLearningTopicsResponse(request, params.serviceSlug, params.programEnrollmentId);
}
export { respond as GET, respond as POST };
