import { createSocialAccountStrategyResponse } from '../../../../../../../src/http/social-account-strategies';
type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };
export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return createSocialAccountStrategyResponse(request, value.workspaceId, value.bunshinId);
}
