import { approveSocialAccountStrategyResponse } from '../../../../../../../../../src/http/social-account-strategies';
type Context = { params: Promise<{ workspaceId: string; bunshinId: string; strategyId: string }> };
export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return approveSocialAccountStrategyResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.strategyId,
  );
}
