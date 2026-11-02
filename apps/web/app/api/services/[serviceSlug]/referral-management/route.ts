import { serviceReferralManagementResponse } from '../../../../../src/http/service-referral-management';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return serviceReferralManagementResponse(request, (await params).serviceSlug);
}
export const POST = GET;
