import { sideHustleRoadmapRevisionResponse } from '../../../../../../../../../src/http/side-hustle';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return sideHustleRoadmapRevisionResponse(request, serviceSlug, programEnrollmentId);
}
