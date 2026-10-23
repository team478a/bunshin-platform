import { sideHustleResponse } from '../../../../../../../../../src/http/side-hustle';
export async function PUT(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const params = await context.params;
  return sideHustleResponse(request, params.serviceSlug, params.programEnrollmentId);
}
