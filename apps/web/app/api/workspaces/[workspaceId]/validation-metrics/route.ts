import { getValidationMetricsResponse } from '../../../../../src/http/validation-metrics';

interface Context {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, context: Context) {
  return getValidationMetricsResponse(request, (await context.params).workspaceId);
}
