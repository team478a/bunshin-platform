import { serviceDailyActionPhotoResponse } from '../../../../../../../../../src/http/service-daily-actions';

type Context = {
  params: Promise<{ serviceSlug: string; bunshinId: string; actionId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId, actionId } = await params;
  return serviceDailyActionPhotoResponse(request, serviceSlug, bunshinId, actionId);
}
