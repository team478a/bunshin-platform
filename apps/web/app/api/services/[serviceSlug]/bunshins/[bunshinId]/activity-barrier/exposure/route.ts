import { recordServiceSocialActivitySupportExposureResponse } from '../../../../../../../../src/http/service-social-activity-barrier';
export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; bunshinId: string }> },
) {
  const { serviceSlug, bunshinId } = await context.params;
  return recordServiceSocialActivitySupportExposureResponse(request, serviceSlug, bunshinId);
}
