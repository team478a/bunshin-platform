import { generateMemberProductSuggestionsResponse } from '../../../../../../src/http/member-product-suggestions';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return generateMemberProductSuggestionsResponse(request, (await params).serviceSlug);
}
