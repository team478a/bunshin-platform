import { generateServiceAccountStrategyResponse } from '../../../../../../../../src/http/service-account-strategies';

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; bunshinId: string }> },
) {
  const { serviceSlug, bunshinId } = await context.params;
  return generateServiceAccountStrategyResponse(request, serviceSlug, bunshinId);
}
