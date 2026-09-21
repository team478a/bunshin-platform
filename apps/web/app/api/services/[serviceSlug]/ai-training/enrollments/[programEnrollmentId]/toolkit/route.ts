import {
  listAiTrainingToolkitResponse,
  saveAiTrainingToolkitItemResponse,
} from '../../../../../../../../src/http/ai-training-participant';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return listAiTrainingToolkitResponse(request, serviceSlug, programEnrollmentId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return saveAiTrainingToolkitItemResponse(request, serviceSlug, programEnrollmentId);
}
