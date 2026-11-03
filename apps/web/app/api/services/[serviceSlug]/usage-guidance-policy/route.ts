import { socialUsageGuidancePolicyResponse } from '../../../../../src/http/social-usage-guidance-policy';
type Context = { params: Promise<{ serviceSlug: string }> };
export async function GET(request: Request, { params }: Context) {
  return socialUsageGuidancePolicyResponse(request, (await params).serviceSlug);
}
export async function PUT(request: Request, { params }: Context) {
  return socialUsageGuidancePolicyResponse(request, (await params).serviceSlug);
}
