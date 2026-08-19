import { setSocialProfileActiveResponse } from '../../../../../../../../../src/http/social-profiles';

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; bunshinId: string; platform: string }> },
) {
  const value = await context.params;
  return setSocialProfileActiveResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.platform,
    true,
  );
}
