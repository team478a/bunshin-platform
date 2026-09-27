import type { PrismaClient } from '@prisma/client';

export const SOCIAL_ACTIVITY_OEM_CANDIDATE_ACTIONS = ['ACCEPT', 'DISMISS', 'COMPLETE'] as const;
export type SocialActivityOemCandidateAction =
  (typeof SOCIAL_ACTIVITY_OEM_CANDIDATE_ACTIONS)[number];

export async function listSocialActivityOemSupportCandidates(
  client: PrismaClient,
  input: { workspaceId: string; groupId: string },
) {
  return client.socialActivityOemSupportCandidate.findMany({
    where: {
      barrierCase: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembership: { status: 'ACTIVE' },
      },
    },
    select: {
      id: true,
      status: true,
      recommendationKey: true,
      recommendationSnapshot: true,
      reasonCode: true,
      detectedAt: true,
      updatedAt: true,
      barrierCase: {
        select: {
          category: true,
          groupMembership: {
            select: { serviceMemberBusinessProfile: { select: { businessName: true } } },
          },
          evidenceSnapshots: {
            orderBy: { detectedAt: 'desc' },
            take: 1,
            select: {
              evidenceCode: true,
              metrics: true,
              observationFrom: true,
              observationTo: true,
            },
          },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { detectedAt: 'desc' }],
    take: 200,
  });
}

export async function transitionSocialActivityOemSupportCandidate(
  client: PrismaClient,
  input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    candidateId: string;
    action: SocialActivityOemCandidateAction;
    reason: string;
    occurredAt?: Date;
  },
) {
  const occurredAt = input.occurredAt ?? new Date();
  return client.$transaction(async (tx) => {
    const actor = await tx.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
      },
      select: { id: true },
    });
    if (!actor) return null;
    const candidate = await tx.socialActivityOemSupportCandidate.findFirst({
      where: {
        id: input.candidateId,
        barrierCase: { workspaceId: input.workspaceId, groupId: input.groupId },
      },
      select: { id: true, status: true },
    });
    if (!candidate) return null;
    const desired =
      input.action === 'ACCEPT'
        ? 'ACCEPTED'
        : input.action === 'DISMISS'
          ? 'DISMISSED'
          : 'COMPLETED';
    if (candidate.status === desired) return candidate;
    const allowed =
      (candidate.status === 'OPEN' && ['ACCEPTED', 'DISMISSED'].includes(desired)) ||
      (candidate.status === 'ACCEPTED' && desired === 'COMPLETED');
    if (!allowed) return null;
    const updated = await tx.socialActivityOemSupportCandidate.updateMany({
      where: { id: candidate.id, status: candidate.status },
      data: {
        status: desired,
        ...(desired === 'ACCEPTED' ? { acceptedAt: occurredAt } : {}),
        ...(desired === 'DISMISSED' ? { dismissedAt: occurredAt } : {}),
        ...(desired === 'COMPLETED' ? { completedAt: occurredAt } : {}),
      },
    });
    if (updated.count !== 1) return null;
    await tx.socialActivityOemSupportCandidateAudit.create({
      data: {
        candidateId: candidate.id,
        action: input.action,
        beforeStatus: candidate.status,
        afterStatus: desired,
        reason: input.reason.slice(0, 500),
        actorUserId: input.actorUserId,
        occurredAt,
      },
    });
    return { id: candidate.id, status: desired };
  });
}
