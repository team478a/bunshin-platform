import {
  createSocialProfileResponse,
  listSocialProfilesResponse,
} from '../../../../../../../src/http/social-profiles';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };

export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return listSocialProfilesResponse(request, value.workspaceId, value.bunshinId);
}

export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return createSocialProfileResponse(request, value.workspaceId, value.bunshinId);
}
