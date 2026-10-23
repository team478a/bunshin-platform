import { sideHustleResponse } from '../../../../../../../../src/http/side-hustle';
type Context = { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> };
async function handle(request: Request, context: Context) {
  const params = await context.params;
  return sideHustleResponse(request, params.serviceSlug, params.programEnrollmentId);
}
export const GET = handle;
