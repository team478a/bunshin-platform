import { personalLearningPilotOperationsResponse } from '../../../../../../src/http/personal-learning-pilot-operations';
export const runtime = 'nodejs';
type Context = { params: Promise<{ serviceSlug: string }> };
export async function GET(request: Request, context: Context) {
  return personalLearningPilotOperationsResponse(request, (await context.params).serviceSlug);
}
export async function POST(request: Request, context: Context) {
  return personalLearningPilotOperationsResponse(request, (await context.params).serviceSlug);
}
