import { personalLearningRequestResponse } from '../../../../../../../../src/http/personal-learning-request';
export const dynamic = 'force-dynamic';
async function respond(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const params = await context.params;
  return personalLearningRequestResponse(request, params.serviceSlug, params.programEnrollmentId);
}
export { respond as GET, respond as POST };
