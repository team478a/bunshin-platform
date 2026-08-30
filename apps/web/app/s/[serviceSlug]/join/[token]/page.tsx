import { InvitationContent } from '../../../../(app)/groups/invitations/[token]/page';

export const dynamic = 'force-dynamic';

export default async function ServiceInvitationPage({
  params,
}: {
  params: Promise<{ serviceSlug: string; token: string }>;
}) {
  const { serviceSlug, token } = await params;
  return InvitationContent({ serviceSlug, token });
}
