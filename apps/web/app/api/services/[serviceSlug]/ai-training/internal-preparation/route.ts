import { personalLearningInternalPreparationResponse } from '../../../../../../src/http/personal-learning-internal-preparation';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ serviceSlug: string }> }) {
  return personalLearningInternalPreparationResponse(request, (await context.params).serviceSlug);
}
