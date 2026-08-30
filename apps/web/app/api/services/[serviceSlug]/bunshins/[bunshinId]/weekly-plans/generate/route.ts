import { generateServiceWeeklyPlanResponse } from '../../../../../../../../src/http/service-weekly-plans';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId } = await params;
  return generateServiceWeeklyPlanResponse(request, serviceSlug, bunshinId);
}
