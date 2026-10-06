import { personalLearningPilotResponse } from '../../../../../../../../src/http/personal-learning-pilot';

type Context = { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> };
export async function GET(request: Request, { params }: Context) {
  const { serviceSlug, programEnrollmentId } = await params;
  return personalLearningPilotResponse(request, serviceSlug, programEnrollmentId);
}
export async function POST(request: Request, context: Context) {
  return GET(request, context);
}
