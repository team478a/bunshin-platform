import { personalLearningConversationOperatorResponse } from '../../../../../../../../src/http/personal-learning-conversation-operator';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; requestId: string }> },
) {
  const { serviceSlug, requestId } = await params;
  return personalLearningConversationOperatorResponse(request, serviceSlug, requestId);
}
