import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { BadgeGroupWorkflowRepository } from '@bunshin/application';

export class PrismaBadgeGroupWorkflowRepository implements BadgeGroupWorkflowRepository {
  constructor(private readonly client: PrismaClient) {}

  private manager(workspaceId: string, groupId: string, userId: string) {
    return this.client.groupMembership.findFirst({
      where: {
        workspaceId,
        groupId,
        userId,
        role: 'MANAGER',
        status: 'ACTIVE',
        group: { status: 'ACTIVE' },
        workspace: { memberships: { some: { userId, status: 'ACTIVE' } } },
      },
      select: { id: true },
    });
  }

  async createAndSubmit(input: Parameters<BadgeGroupWorkflowRepository['createAndSubmit']>[0]) {
    if (!(await this.manager(input.workspaceId, input.groupId, input.actorUserId))) return null;
    try {
      return await this.client.$transaction(
        async (tx) => {
          const manager = await tx.groupMembership.findFirst({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              userId: input.actorUserId,
              role: 'MANAGER',
              status: 'ACTIVE',
              group: { status: 'ACTIVE' },
              workspace: { status: 'ACTIVE' },
            },
            select: { id: true },
          });
          if (!manager) return null;
          const definition = await tx.badgeDefinition.create({
            data: {
              ownerType: 'GROUP',
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              code: input.code,
              category: input.category,
            },
          });
          const version = await tx.badgeVersion.create({
            data: {
              definitionId: definition.id,
              version: 1,
              title: input.title,
              description: input.description,
              imageKey: input.imageKey,
              altText: input.altText,
              conditionType: 'MANUAL_APPROVAL',
              conditionConfig: { type: 'GROUP_MANAGER_APPROVAL' },
              visibilityPolicy: 'GROUP',
              rewardPolicy: { type: 'NONE' },
            },
          });
          await tx.badgeDefinition.update({
            where: { id: definition.id },
            data: { currentVersion: 1 },
          });
          const approval = await tx.badgeApprovalRequest.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              badgeVersionId: version.id,
              requestedByUserId: input.actorUserId,
              requestReason: input.reason,
            },
          });
          await tx.badgeAdminAuditLog.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              badgeDefinitionId: definition.id,
              badgeVersionId: version.id,
              action: 'GROUP_BADGE_CREATED_AND_SUBMITTED',
              afterData: { code: definition.code, approvalRequestId: approval.id },
              reason: input.reason,
              performedByUserId: input.actorUserId,
            },
          });
          return {
            definitionId: definition.id,
            badgeVersionId: version.id,
            approvalRequestId: approval.id,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return null;
      throw error;
    }
  }

  async setDefinitionStatus(
    input: Parameters<BadgeGroupWorkflowRepository['setDefinitionStatus']>[0],
  ) {
    return this.client.$transaction(
      async (tx) => {
        const definition = await tx.badgeDefinition.findFirst({
          where: {
            id: input.definitionId,
            ownerType: 'GROUP',
            status: input.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
            workspace: { status: 'ACTIVE' },
            group: {
              status: 'ACTIVE',
              memberships: {
                some: {
                  userId: input.actorUserId,
                  role: 'MANAGER',
                  serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
                  status: 'ACTIVE',
                },
              },
            },
          },
          select: { id: true, workspaceId: true, groupId: true, status: true },
        });
        if (!definition?.workspaceId || !definition.groupId) return null;
        const updated = await tx.badgeDefinition.update({
          where: { id: definition.id },
          data: { status: input.status },
          select: { id: true, status: true },
        });
        await tx.badgeAdminAuditLog.create({
          data: {
            workspaceId: definition.workspaceId,
            groupId: definition.groupId,
            badgeDefinitionId: definition.id,
            action:
              input.status === 'ACTIVE'
                ? 'GROUP_BADGE_REACTIVATED_BY_SERVICE_OPERATOR'
                : 'GROUP_BADGE_SUSPENDED_BY_SERVICE_OPERATOR',
            beforeData: { status: definition.status },
            afterData: { status: input.status },
            reason: input.reason,
            performedByUserId: input.actorUserId,
            occurredAt: input.now,
          },
        });
        return { id: updated.id, status: updated.status as 'ACTIVE' | 'SUSPENDED' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async reviseDefinition(input: Parameters<BadgeGroupWorkflowRepository['reviseDefinition']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const definition = await tx.badgeDefinition.findFirst({
          where: {
            id: input.definitionId,
            ownerType: 'GROUP',
            status: { in: ['ACTIVE', 'SUSPENDED'] },
            workspace: { status: 'ACTIVE' },
            group: {
              status: 'ACTIVE',
              memberships: {
                some: {
                  userId: input.actorUserId,
                  role: 'MANAGER',
                  serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
                  status: 'ACTIVE',
                },
              },
            },
          },
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
        });
        const previous = definition?.versions[0];
        if (!definition?.workspaceId || !definition.groupId || !previous?.publishedAt) return null;
        const nextVersion = definition.currentVersion + 1;
        const version = await tx.badgeVersion.create({
          data: {
            definitionId: definition.id,
            version: nextVersion,
            title: input.title,
            description: input.description,
            imageKey: previous.imageKey,
            lockedImageKey: previous.lockedImageKey,
            altText: input.altText,
            backgroundColor: previous.backgroundColor,
            conditionType: previous.conditionType,
            conditionConfig: previous.conditionConfig as Prisma.InputJsonValue,
            visibilityPolicy: previous.visibilityPolicy,
            rewardPolicy: previous.rewardPolicy as Prisma.InputJsonValue,
            startsAt: previous.startsAt,
            endsAt: previous.endsAt,
            publishedAt: input.now,
          },
        });
        await tx.badgeApprovalRequest.create({
          data: {
            workspaceId: definition.workspaceId,
            groupId: definition.groupId,
            badgeVersionId: version.id,
            status: 'APPROVED',
            requestedByUserId: input.actorUserId,
            reviewedByUserId: input.actorUserId,
            requestReason: input.reason,
            reviewReason: `サービス運営者による変更: ${input.reason}`,
            requestedAt: input.now,
            reviewedAt: input.now,
          },
        });
        await tx.badgeDefinition.update({
          where: { id: definition.id },
          data: { category: input.category, currentVersion: nextVersion },
        });
        await tx.badgeAdminAuditLog.create({
          data: {
            workspaceId: definition.workspaceId,
            groupId: definition.groupId,
            badgeDefinitionId: definition.id,
            badgeVersionId: version.id,
            action: 'GROUP_BADGE_REVISED_BY_SERVICE_OPERATOR',
            beforeData: {
              version: previous.version,
              category: definition.category,
              title: previous.title,
              description: previous.description,
              altText: previous.altText,
            },
            afterData: {
              version: nextVersion,
              category: input.category,
              title: input.title,
              description: input.description,
              altText: input.altText,
            },
            reason: input.reason,
            performedByUserId: input.actorUserId,
            occurredAt: input.now,
          },
        });
        return { definitionId: definition.id, badgeVersionId: version.id, version: nextVersion };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async submit(input: Parameters<BadgeGroupWorkflowRepository['submit']>[0]) {
    if (!(await this.manager(input.workspaceId, input.groupId, input.actorUserId))) return null;
    const version = await this.client.badgeVersion.findFirst({
      where: {
        id: input.badgeVersionId,
        publishedAt: null,
        conditionType: { in: ['MANUAL_APPROVAL', 'IMPORT'] },
        definition: {
          ownerType: 'GROUP',
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'DRAFT',
        },
      },
      include: { definition: true },
    });
    if (!version || (version.rewardPolicy as { type?: string }).type !== 'NONE') return null;
    return this.client.$transaction(async (tx) => {
      const request = await tx.badgeApprovalRequest.upsert({
        where: { badgeVersionId: version.id },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          badgeVersionId: version.id,
          requestedByUserId: input.actorUserId,
          requestReason: input.reason,
        },
        update: {
          status: 'PENDING',
          requestedByUserId: input.actorUserId,
          requestReason: input.reason,
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
          action: 'GROUP_BADGE_SUBMITTED',
          afterData: { approvalRequestId: request.id },
          reason: input.reason,
          performedByUserId: input.actorUserId,
        },
      });
      return { id: request.id, status: 'PENDING' as const };
    });
  }

  async review(input: Parameters<BadgeGroupWorkflowRepository['review']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const request = await tx.badgeApprovalRequest.findFirst({
          where: { id: input.approvalRequestId, status: 'PENDING' },
          include: { badgeVersion: { include: { definition: true } } },
        });
        if (
          !request ||
          request.badgeVersion.definition.ownerType !== 'GROUP' ||
          request.badgeVersion.definition.groupId !== request.groupId
        )
          return null;
        const [admin, serviceOperator] = await Promise.all([
          tx.platformAdmin.findFirst({
            where: { userId: input.actorUserId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
            select: { id: true },
          }),
          tx.groupMembership.findFirst({
            where: {
              workspaceId: request.workspaceId,
              groupId: request.groupId,
              userId: input.actorUserId,
              status: 'ACTIVE',
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
            },
            select: { id: true },
          }),
        ]);
        if (!admin && !serviceOperator) return null;
        const updated = await tx.badgeApprovalRequest.update({
          where: { id: request.id },
          data: {
            status: input.decision,
            reviewedByUserId: input.actorUserId,
            reviewReason: input.reason,
            reviewedAt: input.now,
          },
        });
        if (input.decision === 'APPROVED') {
          await tx.badgeVersion.update({
            where: { id: request.badgeVersionId },
            data: { publishedAt: input.now },
          });
          await tx.badgeDefinition.update({
            where: { id: request.badgeVersion.definitionId },
            data: { status: 'ACTIVE' },
          });
        }
        await tx.badgeAdminAuditLog.create({
          data: {
            workspaceId: request.workspaceId,
            groupId: request.groupId,
            badgeDefinitionId: request.badgeVersion.definitionId,
            badgeVersionId: request.badgeVersionId,
            action: `GROUP_BADGE_${input.decision}`,
            beforeData: { status: 'PENDING' },
            afterData: { status: input.decision },
            reason: input.reason,
            performedByUserId: input.actorUserId,
          },
        });
        return { id: updated.id, status: updated.status as 'APPROVED' | 'REJECTED' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async nominate(input: Parameters<BadgeGroupWorkflowRepository['nominate']>[0]) {
    if (!(await this.manager(input.workspaceId, input.groupId, input.actorUserId))) return null;
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
