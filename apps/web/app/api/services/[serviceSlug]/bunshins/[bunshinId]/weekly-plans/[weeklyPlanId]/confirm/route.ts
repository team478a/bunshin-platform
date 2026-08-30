import { setServiceWeeklyPlanStatusResponse } from '../../../../../../../../../src/http/service-weekly-plans';

type Context = {
  params: Promise<{ serviceSlug: string; bunshinId: string; weeklyPlanId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId, weeklyPlanId } = await params;
  return setServiceWeeklyPlanStatusResponse(
    request,
    serviceSlug,
    bunshinId,
    weeklyPlanId,
    'confirm',
  );
}
