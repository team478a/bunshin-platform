import { deleteServiceDailyActionResponse } from '../../../../../../../../src/http/service-daily-actions';

type Context = {
  params: Promise<{ serviceSlug: string; bunshinId: string; actionId: string }>;
};

export async function DELETE(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId, actionId } = await params;
  return deleteServiceDailyActionResponse(request, serviceSlug, bunshinId, actionId);
}
