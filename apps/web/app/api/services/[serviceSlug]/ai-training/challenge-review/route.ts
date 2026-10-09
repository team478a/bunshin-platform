import { reproductionChallengeReviewResponse } from '../../../../../../src/http/reproduction-challenge-review';
export const runtime = 'nodejs';
type Context = { params: Promise<{ serviceSlug: string }> };
export async function GET(request: Request, context: Context) {
  return reproductionChallengeReviewResponse(request, (await context.params).serviceSlug);
}
export async function POST(request: Request, context: Context) {
  return reproductionChallengeReviewResponse(request, (await context.params).serviceSlug);
}
