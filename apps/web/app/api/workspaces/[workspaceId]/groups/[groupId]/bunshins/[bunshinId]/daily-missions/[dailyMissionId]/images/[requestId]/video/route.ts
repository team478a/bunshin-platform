import { createCarouselVideoResponse } from '../../../../../../../../../../../../../src/http/social-images';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      workspaceId: string;
      groupId: string;
      bunshinId: string;
      dailyMissionId: string;
      requestId: string;
    }>;
  },
) {
  const params = await context.params;
  return createCarouselVideoResponse(
    request,
    params.workspaceId,
    params.groupId,
    params.bunshinId,
    params.dailyMissionId,
    params.requestId,
  );
}
