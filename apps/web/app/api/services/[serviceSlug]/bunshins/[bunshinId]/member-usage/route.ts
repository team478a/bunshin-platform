import { getServiceMemberUsageResponse } from '../../../../../../../src/http/service-member-usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export async function GET(request: Request, context: Context) {
  const { serviceSlug, bunshinId } = await context.params;
  return getServiceMemberUsageResponse(request, serviceSlug, bunshinId);
}
