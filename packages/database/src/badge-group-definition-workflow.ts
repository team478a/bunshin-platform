import { Prisma, type PrismaClient } from '@prisma/client';
import type { BadgeGroupWorkflowRepository } from '@bunshin/application';
import { PrismaBadgeGroupWorkflowBase } from './badge-group-workflow-base';

export class PrismaBadgeGroupDefinitionWorkflow extends PrismaBadgeGroupWorkflowBase {
  constructor(client: PrismaClient) {
    super(client);
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
            imageKey: input.imageKey,
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
              imageKey: previous.imageKey,
              altText: previous.altText,
            },
            afterData: {
              version: nextVersion,
              category: input.category,
              title: input.title,
              description: input.description,
              imageKey: input.imageKey,
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
}
