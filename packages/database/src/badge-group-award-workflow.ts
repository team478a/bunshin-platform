import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { BadgeGroupWorkflowRepository } from '@bunshin/application';
import { PrismaBadgeGroupWorkflowBase } from './badge-group-workflow-base';

export class PrismaBadgeGroupAwardWorkflow extends PrismaBadgeGroupWorkflowBase {
  constructor(client: PrismaClient) {
    super(client);
  }

  async nominate(input: Parameters<BadgeGroupWorkflowRepository['nominate']>[0]) {
    if (!(await this.manager(input.workspaceId, input.groupId, input.actorUserId))) return null;
    if (input.actorUserId === input.userId) {
      const serviceOperator = await this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
        },
        select: { id: true },
      });
      if (serviceOperator) return null;
    }
    const [version, member] = await Promise.all([
      this.client.badgeVersion.findFirst({
        where: {
          id: input.badgeVersionId,
          publishedAt: { not: null },
          definition: {
            ownerType: 'GROUP',
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            status: 'ACTIVE',
          },
        },
        include: { definition: { select: { currentVersion: true } } },
      }),
      this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.userId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
    ]);
    if (!version || !member || version.version !== version.definition.currentVersion) return null;
    const existingAward = await this.client.badgeAward.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.userId,
        status: 'ACTIVE',
        badgeVersion: { definitionId: version.definitionId },
      },
      select: { id: true },
    });
    if (existingAward) return null;
    return this.client.$transaction(async (tx) => {
      const candidate = await tx.badgeAwardCandidate.upsert({
        where: {
          workspaceId_groupId_badgeVersionId_userId: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            badgeVersionId: input.badgeVersionId,
            userId: input.userId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          badgeVersionId: input.badgeVersionId,
          userId: input.userId,
          nominatedByUserId: input.actorUserId,
          nominationReason: input.reason,
        },
        update: {
          status: 'PENDING',
          nominatedByUserId: input.actorUserId,
          nominationReason: input.reason,
          reviewedByUserId: null,
          reviewReason: null,
          reviewedAt: null,
        },
      });
      await tx.badgeAdminAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          badgeDefinitionId: version.definitionId,
          badgeVersionId: version.id,
          action: 'GROUP_BADGE_CANDIDATE_NOMINATED',
          afterData: { candidateId: candidate.id, userId: input.userId },
          reason: input.reason,
          performedByUserId: input.actorUserId,
        },
      });
      return { id: candidate.id, status: 'PENDING' as const };
    });
  }

  async reviewCandidate(input: Parameters<BadgeGroupWorkflowRepository['reviewCandidate']>[0]) {
    const candidate = await this.client.badgeAwardCandidate.findFirst({
      where: { id: input.candidateId, status: 'PENDING' },
      include: { badgeVersion: { include: { definition: true } } },
    });
    if (!candidate) return null;
    const [manager, serviceOperator] = await Promise.all([
      this.manager(candidate.workspaceId, candidate.groupId, input.actorUserId),
      this.client.groupMembership.findFirst({
        where: {
          workspaceId: candidate.workspaceId,
          groupId: candidate.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: 'MANAGER',
          serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
        },
        select: { id: true },
      }),
    ]);
    if (!manager) return null;
    if (
      !serviceOperator &&
      (input.actorUserId === candidate.userId || input.actorUserId === candidate.nominatedByUserId)
    )
      return null;
    return this.client.$transaction(
      async (tx) => {
        if (input.decision === 'APPROVED') {
          const existingAward = await tx.badgeAward.findFirst({
            where: {
              workspaceId: candidate.workspaceId,
              groupId: candidate.groupId,
              userId: candidate.userId,
              status: 'ACTIVE',
              badgeVersion: { definitionId: candidate.badgeVersion.definitionId },
            },
            select: { id: true },
          });
          if (existingAward) return null;
        }
        const updated = await tx.badgeAwardCandidate.update({
          where: { id: candidate.id },
          data: {
            status: input.decision,
            reviewedByUserId: input.actorUserId,
            reviewReason: input.reason,
            reviewedAt: input.now,
          },
        });
        let awardId: string | null = null;
        if (input.decision === 'APPROVED') {
          const evidenceHash = createHash('sha256')
            .update(`candidate:${candidate.id}:${candidate.userId}:${candidate.badgeVersionId}`)
            .digest('hex');
          const award = await tx.badgeAward.upsert({
            where: {
              workspaceId_userId_badgeVersionId: {
                workspaceId: candidate.workspaceId,
                userId: candidate.userId,
                badgeVersionId: candidate.badgeVersionId,
              },
            },
            create: {
              workspaceId: candidate.workspaceId,
              userId: candidate.userId,
              badgeVersionId: candidate.badgeVersionId,
              groupId: candidate.groupId,
              awardedAt: input.now,
              sourceType: 'GROUP_APPROVAL',
              sourceId: candidate.id,
              evidenceHash,
              idempotencyKey: `group-candidate:${candidate.id}`,
            },
            update: {
              groupId: candidate.groupId,
              awardedAt: input.now,
              sourceType: 'GROUP_APPROVAL',
              sourceId: candidate.id,
              evidenceHash,
              idempotencyKey: `group-candidate:${candidate.id}`,
              status: 'ACTIVE',
              revokedAt: null,
              expiredAt: null,
            },
          });
          awardId = award.id;
          await tx.badgeProgress.upsert({
            where: {
              workspaceId_userId_badgeVersionId: {
                workspaceId: candidate.workspaceId,
                userId: candidate.userId,
                badgeVersionId: candidate.badgeVersionId,
              },
            },
            create: {
              workspaceId: candidate.workspaceId,
              userId: candidate.userId,
              badgeVersionId: candidate.badgeVersionId,
              groupId: candidate.groupId,
              currentValue: 1,
              targetValue: 1,
              status: 'AWARDED',
              lastEventAt: input.now,
            },
            update: {
              status: 'AWARDED',
              currentValue: 1,
              targetValue: 1,
              lastEventAt: input.now,
              revision: { increment: 1 },
            },
          });
        }
        await tx.badgeAdminAuditLog.create({
          data: {
            workspaceId: candidate.workspaceId,
            groupId: candidate.groupId,
            badgeDefinitionId: candidate.badgeVersion.definitionId,
            badgeVersionId: candidate.badgeVersionId,
            badgeAwardId: awardId,
            action: `BADGE_CANDIDATE_${input.decision}`,
            beforeData: { candidateId: candidate.id, status: 'PENDING' },
            afterData: { status: input.decision, targetUserId: candidate.userId },
            reason: input.reason,
            performedByUserId: input.actorUserId,
          },
        });
        return { id: updated.id, status: updated.status as 'APPROVED' | 'REJECTED', awardId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async revokeAward(input: Parameters<BadgeGroupWorkflowRepository['revokeAward']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const award = await tx.badgeAward.findFirst({
          where: {
            id: input.awardId,
            status: 'ACTIVE',
            sourceType: 'GROUP_APPROVAL',
            groupId: { not: null },
            badgeVersion: { definition: { ownerType: 'GROUP' } },
          },
          include: { badgeVersion: { include: { definition: true } } },
        });
        if (!award?.groupId || award.badgeVersion.definition.groupId !== award.groupId) return null;
        const operator = await tx.groupMembership.findFirst({
          where: {
            workspaceId: award.workspaceId,
            groupId: award.groupId,
            userId: input.actorUserId,
            role: 'MANAGER',
            status: 'ACTIVE',
            serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
            group: { status: 'ACTIVE' },
            workspace: { status: 'ACTIVE' },
          },
          select: { id: true },
        });
        if (!operator) return null;

        const updated = await tx.badgeAward.updateMany({
          where: { id: award.id, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: input.now },
        });
        if (updated.count !== 1) return null;
        await tx.badgeProgress.updateMany({
          where: {
            workspaceId: award.workspaceId,
            userId: award.userId,
            badgeVersionId: award.badgeVersionId,
            groupId: award.groupId,
            status: 'AWARDED',
          },
          data: { status: 'ELIGIBLE', revision: { increment: 1 } },
        });
        await tx.badgeLineNotificationDelivery.updateMany({
          where: {
            workspaceId: award.workspaceId,
            groupId: award.groupId,
            userId: award.userId,
            status: { in: ['PENDING', 'FAILED'] },
            badgeNotification: { badgeAwardId: award.id },
          },
          data: { status: 'CANCELLED', cancelledAt: input.now },
        });
        await tx.badgeAdminAuditLog.create({
          data: {
            workspaceId: award.workspaceId,
            groupId: award.groupId,
            badgeDefinitionId: award.badgeVersion.definitionId,
            badgeVersionId: award.badgeVersionId,
            badgeAwardId: award.id,
            action: 'BADGE_AWARD_REVOKED_BY_SERVICE_OPERATOR',
            beforeData: { status: 'ACTIVE', targetUserId: award.userId },
            afterData: { status: 'REVOKED', targetUserId: award.userId },
            reason: input.reason,
            performedByUserId: input.actorUserId,
          },
        });
        return { id: award.id, status: 'REVOKED' as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
