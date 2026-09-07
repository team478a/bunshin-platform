import {
  generateServiceMissionContentVariantResponse,
  listServiceMissionContentVariantsResponse,
} from '../../../../../../../../../src/http/service-daily-missions';

type Context = {
  params: Promise<{ serviceSlug: string; bunshinId: string; dailyMissionId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId, dailyMissionId } = await params;
  return listServiceMissionContentVariantsResponse(request, serviceSlug, bunshinId, dailyMissionId);
}

export async function POST(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId, dailyMissionId } = await params;
  return generateServiceMissionContentVariantResponse(
    request,
    serviceSlug,
    bunshinId,
    dailyMissionId,
  );
}
