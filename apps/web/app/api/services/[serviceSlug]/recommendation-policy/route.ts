import { socialRecommendationPolicyResponse } from '../../../../../src/http/social-recommendation-policy';
type Context = { params: Promise<{ serviceSlug: string }> };
export async function GET(request: Request, { params }: Context) {
  return socialRecommendationPolicyResponse(request, (await params).serviceSlug);
}
export async function PUT(request: Request, { params }: Context) {
  return socialRecommendationPolicyResponse(request, (await params).serviceSlug);
}
