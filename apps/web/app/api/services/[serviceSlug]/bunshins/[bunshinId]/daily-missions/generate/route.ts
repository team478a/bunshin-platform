import { generateServiceDailyMissionResponse } from '../../../../../../../../src/http/service-daily-missions';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId } = await params;
  return generateServiceDailyMissionResponse(request, serviceSlug, bunshinId);
}
