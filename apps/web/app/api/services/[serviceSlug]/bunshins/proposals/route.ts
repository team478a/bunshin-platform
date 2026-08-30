import { serviceBunshinProposalsResponse } from '../../../../../../src/http/service-bunshin-proposals';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return serviceBunshinProposalsResponse(request, (await params).serviceSlug);
}
