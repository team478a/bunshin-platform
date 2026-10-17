import { personalLearningPersonaResponse } from '../../../../../../../../../src/http/personal-learning-persona';

export const dynamic = 'force-dynamic';

async function handle(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return personalLearningPersonaResponse(request, serviceSlug, programEnrollmentId);
}

export { handle as GET, handle as PATCH, handle as DELETE };
