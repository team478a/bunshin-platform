import { saveServiceMemberTrackingLink } from '../../../../../src/http/service-member-tracking-link';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return saveServiceMemberTrackingLink(request, (await params).serviceSlug);
}
