import { listServiceWeeklyPlansResponse } from '../../../../../../../src/http/service-weekly-plans';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId } = await params;
  return listServiceWeeklyPlansResponse(request, serviceSlug, bunshinId);
}
