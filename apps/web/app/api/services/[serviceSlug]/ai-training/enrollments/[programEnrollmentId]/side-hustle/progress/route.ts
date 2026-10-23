import { sideHustleProgressResponse } from '../../../../../../../../../src/http/side-hustle';
export async function GET(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const params = await context.params;
  return sideHustleProgressResponse(request, params.serviceSlug, params.programEnrollmentId);
}
