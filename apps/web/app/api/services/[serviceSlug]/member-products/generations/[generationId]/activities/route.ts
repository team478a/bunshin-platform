import { recordMemberProductActivityResponse } from '../../../../../../../../src/http/member-product-activities';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; generationId: string }> },
) {
  const value = await params;
  return recordMemberProductActivityResponse(request, value.serviceSlug, value.generationId);
}
