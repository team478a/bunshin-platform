import { generateSocialAccountStrategyResponse } from '../../../../../../../../src/http/social-account-strategies';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };

export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return generateSocialAccountStrategyResponse(request, value.workspaceId, value.bunshinId);
}
