import { archiveMemberProductProfileResponse } from '../../../../../../src/http/member-product-profiles';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; profileId: string }> },
) {
  const value = await params;
  return archiveMemberProductProfileResponse(request, value.serviceSlug, value.profileId);
}
