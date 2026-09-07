import { selectMissionContentVariantResponse } from '../../../../../../../../../../../src/http/daily-missions';

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      workspaceId: string;
      bunshinId: string;
      dailyMissionId: string;
      variantId: string;
    }>;
  },
) {
  const { workspaceId, bunshinId, dailyMissionId, variantId } = await params;
  return selectMissionContentVariantResponse(
    request,
    workspaceId,
    bunshinId,
    dailyMissionId,
    variantId,
  );
}
