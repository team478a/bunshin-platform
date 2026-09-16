import { updateFortuneFeedbackResponse } from '../../../../../../../../src/http/fortune';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; readingId: string }> },
) {
  const { serviceSlug, readingId } = await context.params;
  return updateFortuneFeedbackResponse(request, serviceSlug, readingId);
}
