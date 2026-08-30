import { updateServiceSocialProfileResponse } from '../../../../../../../../src/http/service-social-profiles';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; bunshinId: string; platform: string }> },
) {
  const { serviceSlug, bunshinId, platform } = await context.params;
  return updateServiceSocialProfileResponse(request, serviceSlug, bunshinId, platform);
}
