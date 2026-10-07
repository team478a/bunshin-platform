import { personalLearningPilotProfileResponse } from '../../../../../../../../../src/http/personal-learning-pilot-profile';
async function handle(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return personalLearningPilotProfileResponse(request, serviceSlug, programEnrollmentId);
}
export const GET = handle;
export const POST = handle;
