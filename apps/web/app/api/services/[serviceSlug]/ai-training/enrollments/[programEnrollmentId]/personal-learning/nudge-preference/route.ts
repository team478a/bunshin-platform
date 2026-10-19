import { personalLearningNudgePreferenceResponse } from '../../../../../../../../../src/http/personal-learning-nudge-preference';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await params;
  return personalLearningNudgePreferenceResponse(request, serviceSlug, programEnrollmentId);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await params;
  return personalLearningNudgePreferenceResponse(request, serviceSlug, programEnrollmentId);
}
