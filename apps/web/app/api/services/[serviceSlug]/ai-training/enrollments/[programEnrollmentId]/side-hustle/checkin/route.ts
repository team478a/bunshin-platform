import { sideHustleCheckinResponse } from '../../../../../../../../../src/http/side-hustle';
export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const params = await context.params;
  return sideHustleCheckinResponse(request, params.serviceSlug, params.programEnrollmentId);
}
