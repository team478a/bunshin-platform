import { recordMemberProductActivityResponse } from '../../../../../../src/http/member-product-activity';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return recordMemberProductActivityResponse(request, (await params).serviceSlug);
}
