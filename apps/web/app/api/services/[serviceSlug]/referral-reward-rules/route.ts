import { saveServiceReferralRewardRuleResponse } from '../../../../../src/http/service-referral-reward-rules';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return saveServiceReferralRewardRuleResponse(request, (await params).serviceSlug);
}
