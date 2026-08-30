import { requestServiceParticipationResponse } from '../../../../../src/http/service-participation';

type Context = { params: Promise<{ serviceSlug: string }> };

export async function POST(request: Request, context: Context) {
  const { serviceSlug } = await context.params;
  return requestServiceParticipationResponse(request, serviceSlug);
}
