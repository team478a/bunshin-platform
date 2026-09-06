import { saveMemberProductProfileResponse } from '../../../../../src/http/member-product-profiles';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return saveMemberProductProfileResponse(request, (await params).serviceSlug);
}
