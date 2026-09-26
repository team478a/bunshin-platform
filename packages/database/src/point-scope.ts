import type { Prisma } from './client';

export async function activePointMember(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
) {
  return tx.workspaceMembership.findFirst({
    where: {
      workspaceId,
      userId,
      status: 'ACTIVE',
      workspace: { status: 'ACTIVE' },
      user: { status: 'ACTIVE' },
    },
    select: { id: true },
  });
}

export async function validPointAttribution(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; groupId: string | null; campaignId: string | null },
) {
  if (input.campaignId && !input.groupId) return false;
  if (input.groupId) {
    const group = await tx.group.findFirst({
      where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!group) return false;
  }
  if (input.campaignId) {
    const campaign = await tx.campaign.findFirst({
      where: {
        id: input.campaignId,
        workspaceId: input.workspaceId,
        groupId: input.groupId!,
      },
      select: { id: true },
    });
    if (!campaign) return false;
  }
  return true;
}
