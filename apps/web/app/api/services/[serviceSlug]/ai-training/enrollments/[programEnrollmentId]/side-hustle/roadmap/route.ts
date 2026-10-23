import { sideHustleRoadmapResponse } from '../../../../../../../../../src/http/side-hustle';
export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const params = await context.params;
  return sideHustleRoadmapResponse(request, params.serviceSlug, params.programEnrollmentId);
}
