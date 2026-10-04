import { improvementFeedbackResponse } from '../../../../../../../src/http/improvement-feedback';
export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; bunshinId: string }> },
) {
  const { serviceSlug, bunshinId } = await context.params;
  return improvementFeedbackResponse(request, serviceSlug, bunshinId);
}
