import { getServiceMemberRoadmapResponse } from '../../../../../../../src/http/service-member-roadmap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export async function GET(request: Request, context: Context) {
  const { serviceSlug, bunshinId } = await context.params;
  return getServiceMemberRoadmapResponse(request, serviceSlug, bunshinId);
}
