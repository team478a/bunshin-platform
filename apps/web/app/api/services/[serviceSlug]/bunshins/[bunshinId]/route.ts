import {
  getServiceBunshinResponse,
  updateServiceBunshinResponse,
} from '../../../../../../src/http/service-bunshins';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: Context) {
  const { serviceSlug, bunshinId } = await context.params;
  return getServiceBunshinResponse(request, serviceSlug, bunshinId);
}

export async function PATCH(request: Request, context: Context) {
  const { serviceSlug, bunshinId } = await context.params;
  return updateServiceBunshinResponse(request, serviceSlug, bunshinId);
}
