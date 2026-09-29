import { trainingLifecycleResponse } from '../../../../../../../../src/http/ai-training-lifecycle';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const value = await params;
  return trainingLifecycleResponse(request, value.serviceSlug, value.programEnrollmentId);
}
