import { personalLearningConversationSharingResponse } from '../../../../../../../../../../src/http/personal-learning-conversation';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await params;
  return personalLearningConversationSharingResponse(request, serviceSlug, programEnrollmentId);
}
