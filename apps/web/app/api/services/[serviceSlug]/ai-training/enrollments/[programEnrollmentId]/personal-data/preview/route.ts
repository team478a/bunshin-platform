import { trainingPersonalDataDeletionResponse } from '../../../../../../../../../src/http/ai-training-personal-data-deletion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return trainingPersonalDataDeletionResponse(request, serviceSlug, programEnrollmentId, 'preview');
}
