import {
  getAiResaleOfferResponse,
  submitAiResaleOfferActionResponse,
} from '../../../../../../../src/http/ai-resale-offer';

export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
};

export async function GET(request: Request, context: Context) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return getAiResaleOfferResponse(request, serviceSlug, programEnrollmentId);
}

export async function POST(request: Request, context: Context) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return submitAiResaleOfferActionResponse(request, serviceSlug, programEnrollmentId);
}
