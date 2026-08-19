import { listSocialAccountStrategiesResponse } from '../../../../../../../../../src/http/social-account-strategies';
type Context = {
  params: Promise<{ workspaceId: string; bunshinId: string; socialProfileId: string }>;
};
export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return listSocialAccountStrategiesResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.socialProfileId,
  );
}
