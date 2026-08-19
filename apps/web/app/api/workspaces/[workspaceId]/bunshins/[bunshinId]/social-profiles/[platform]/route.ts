import { updateSocialProfileResponse } from '../../../../../../../../src/http/social-profiles';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string; bunshinId: string; platform: string }> },
) {
  const value = await context.params;
  return updateSocialProfileResponse(request, value.workspaceId, value.bunshinId, value.platform);
}
