import {
  getAiResaleCurrentActionResponse,
  submitAiResaleActionResultResponse,
} from '../../../../../../../src/http/ai-resale-participant';

export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
};

export async function GET(request: Request, context: Context) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return getAiResaleCurrentActionResponse(request, serviceSlug, programEnrollmentId);
}

export async function POST(request: Request, context: Context) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return submitAiResaleActionResultResponse(request, serviceSlug, programEnrollmentId);
}
