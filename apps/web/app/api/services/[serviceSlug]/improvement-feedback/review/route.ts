import { feedbackReviewResponse } from '../../../../../../src/http/improvement-feedback-review';
export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  return feedbackReviewResponse(request, (await context.params).serviceSlug);
}
