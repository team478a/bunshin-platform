import {
  createServiceSocialProfileResponse,
  listServiceSocialProfilesResponse,
} from '../../../../../../../src/http/service-social-profiles';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export async function GET(request: Request, context: Context) {
  const { serviceSlug, bunshinId } = await context.params;
  return listServiceSocialProfilesResponse(request, serviceSlug, bunshinId);
}

export async function POST(request: Request, context: Context) {
  const { serviceSlug, bunshinId } = await context.params;
  return createServiceSocialProfileResponse(request, serviceSlug, bunshinId);
}
