import { personalLearningConversationResponse } from '../../../../../../../../../src/http/personal-learning-conversation';

export const dynamic = 'force-dynamic';

async function respond(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const params = await context.params;
  return personalLearningConversationResponse(
    request,
    params.serviceSlug,
    params.programEnrollmentId,
  );
}

export { respond as POST };
