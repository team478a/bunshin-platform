import { ensureServiceReferralCodeResponse } from '../../../../../src/http/service-referral-code';

type Context = { params: Promise<{ serviceSlug: string }> };

export async function POST(request: Request, context: Context) {
  const { serviceSlug } = await context.params;
  return ensureServiceReferralCodeResponse(request, serviceSlug);
}
