import { setServiceSocialProfileActiveResponse } from '../../../../../../../../../src/http/service-social-profiles';

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; bunshinId: string; platform: string }> },
) {
  const { serviceSlug, bunshinId, platform } = await context.params;
  return setServiceSocialProfileActiveResponse(request, serviceSlug, bunshinId, platform, true);
}
