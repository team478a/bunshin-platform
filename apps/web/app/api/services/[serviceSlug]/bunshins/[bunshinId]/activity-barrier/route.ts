import {
  answerServiceSocialActivityBarrierResponse,
  getServiceSocialActivityBarrierResponse,
  transitionServiceSocialActivitySupportResponse,
} from '../../../../../../../src/http/service-social-activity-barrier';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export async function GET(request: Request, context: Context) {
  const { serviceSlug, bunshinId } = await context.params;
  return getServiceSocialActivityBarrierResponse(request, serviceSlug, bunshinId);
}

export async function POST(request: Request, context: Context) {
  const { serviceSlug, bunshinId } = await context.params;
  return answerServiceSocialActivityBarrierResponse(request, serviceSlug, bunshinId);
}

export async function PATCH(request: Request, context: Context) {
  const { serviceSlug, bunshinId } = await context.params;
  return transitionServiceSocialActivitySupportResponse(request, serviceSlug, bunshinId);
}
