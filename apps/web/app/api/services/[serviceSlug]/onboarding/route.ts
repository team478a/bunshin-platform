import { saveServiceOnboardingResponse } from '../../../../../src/http/service-onboarding';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return saveServiceOnboardingResponse(request, (await params).serviceSlug);
}
