import { setServiceContentPillarActiveResponse } from '../../../../../../../../../src/http/service-content-pillars';

export async function POST(
  request: Request,
  context: {
    params: Promise<{ serviceSlug: string; bunshinId: string; pillarId: string }>;
  },
) {
  const { serviceSlug, bunshinId, pillarId } = await context.params;
  return setServiceContentPillarActiveResponse(request, serviceSlug, bunshinId, pillarId, false);
}
