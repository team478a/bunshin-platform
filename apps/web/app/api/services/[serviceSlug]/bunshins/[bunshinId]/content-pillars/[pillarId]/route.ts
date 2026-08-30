import {
  deleteServiceContentPillarResponse,
  getServiceContentPillarResponse,
  updateServiceContentPillarResponse,
} from '../../../../../../../../src/http/service-content-pillars';

type Context = {
  params: Promise<{ serviceSlug: string; bunshinId: string; pillarId: string }>;
};

export async function GET(request: Request, context: Context) {
  const { serviceSlug, bunshinId, pillarId } = await context.params;
  return getServiceContentPillarResponse(request, serviceSlug, bunshinId, pillarId);
}

export async function PATCH(request: Request, context: Context) {
  const { serviceSlug, bunshinId, pillarId } = await context.params;
  return updateServiceContentPillarResponse(request, serviceSlug, bunshinId, pillarId);
}

export async function DELETE(request: Request, context: Context) {
  const { serviceSlug, bunshinId, pillarId } = await context.params;
  return deleteServiceContentPillarResponse(request, serviceSlug, bunshinId, pillarId);
}
