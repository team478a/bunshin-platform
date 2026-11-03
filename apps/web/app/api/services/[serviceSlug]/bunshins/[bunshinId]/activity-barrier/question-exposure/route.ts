import { recordServiceSocialActivityQuestionExposureResponse } from '../../../../../../../../src/http/service-social-activity-barrier';
export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; bunshinId: string }> },
) {
  const { serviceSlug, bunshinId } = await context.params;
  return recordServiceSocialActivityQuestionExposureResponse(request, serviceSlug, bunshinId);
}
