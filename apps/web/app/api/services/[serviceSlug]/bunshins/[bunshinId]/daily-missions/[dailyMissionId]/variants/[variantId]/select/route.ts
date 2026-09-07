import { selectServiceMissionContentVariantResponse } from '../../../../../../../../../../../src/http/service-daily-missions';

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      serviceSlug: string;
      bunshinId: string;
      dailyMissionId: string;
      variantId: string;
    }>;
  },
) {
  const { serviceSlug, bunshinId, dailyMissionId, variantId } = await params;
  return selectServiceMissionContentVariantResponse(
    request,
    serviceSlug,
    bunshinId,
    dailyMissionId,
    variantId,
  );
}
