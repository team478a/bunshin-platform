import { approveServiceAccountStrategyResponse } from '../../../../../../../../../src/http/service-account-strategies';

export async function POST(
  request: Request,
  context: {
    params: Promise<{ serviceSlug: string; bunshinId: string; strategyId: string }>;
  },
) {
  const { serviceSlug, bunshinId, strategyId } = await context.params;
  return approveServiceAccountStrategyResponse(request, serviceSlug, bunshinId, strategyId);
}
