import { completeServiceDailyActionPhotoResponse } from '../../../../../../../../../src/http/service-daily-actions';

type Context = {
  params: Promise<{ serviceSlug: string; bunshinId: string; actionId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId, actionId } = await params;
  return completeServiceDailyActionPhotoResponse(request, serviceSlug, bunshinId, actionId);
}
