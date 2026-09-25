import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { requireOrganizationManager } from './organization-manager-access';

export type OrganizationManageSearchParams = {
  saved?: string;
  invitation?: string;
  delivery?: string;
  invitationAction?: string;
  error?: string;
};

export async function loadOrganizationManagePage({
  workspaceId: rawWorkspaceId,
  query,
}: {
  workspaceId: string;
  query: OrganizationManageSearchParams;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const workspaceId = z.uuid().safeParse(rawWorkspaceId);
  if (!workspaceId.success) notFound();
  const db = await requireOrganizationManager(workspaceId.data, user.userId);
  const organization = await db.prisma.workspace.findFirst({
    where: { id: workspaceId.data, type: 'ORGANIZATION' },
    select: {
      id: true,
      name: true,
      legalName: true,
      description: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      websiteUrl: true,
      address: true,
      memberships: {
        where: { status: 'ACTIVE' },
        select: { id: true, role: true, user: { select: { displayName: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
      groups: { where: { status: 'ACTIVE' }, select: { id: true, name: true } },
      invitations: {
        select: {
          id: true,
          inviteeEmail: true,
          role: true,
          status: true,
          expiresAt: true,
          lastSentAt: true,
          revokedAt: true,
          acceptedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });
  if (!organization) notFound();
  return { organization, query };
}

export type OrganizationManagePageModel = Awaited<ReturnType<typeof loadOrganizationManagePage>>;
