import { deferServiceOnboardingRefinement } from '../../../../../../src/http/service-onboarding-refinement';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return deferServiceOnboardingRefinement(request, (await params).serviceSlug);
}
