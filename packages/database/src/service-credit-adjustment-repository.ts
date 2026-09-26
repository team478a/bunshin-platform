import type { ServiceCreditAdjustmentRepository } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';

export class PrismaServiceCreditAdjustmentRepository implements ServiceCreditAdjustmentRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async adjust(input: Parameters<ServiceCreditAdjustmentRepository['adjust']>[0]) {
    return this.client.$transaction(async (tx) => {
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
      const member = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          id: input.membershipId,
          status: 'ACTIVE',
          serviceRole: 'PARTICIPANT',
        },
        select: { id: true, userId: true },
      });
      if (!actor || !member) return null;
      let account = await tx.serviceCreditAccount.findUnique({
        where: {
          workspaceId_groupId_groupMembershipId: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: member.id,
          },
        },
        select: { id: true, availableCredits: true },
      });
      if (!account && input.amount < 0) return null;
      if (!account) {
        account = await tx.serviceCreditAccount.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: member.id,
            userId: member.userId,
          },
          select: { id: true, availableCredits: true },
        });
      }
      if (account.availableCredits + input.amount < 0) return null;
      const existing = await tx.serviceCreditLedger.findUnique({
        where: {
          accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey },
        },
        select: { balanceAfter: true },
      });
      if (existing) return { availableCredits: existing.balanceAfter };
      const updated = await tx.serviceCreditAccount.update({
        where: { id: account.id },
        data: { availableCredits: { increment: input.amount }, revision: { increment: 1 } },
        select: { availableCredits: true },
      });
      await tx.serviceCreditLedger.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          accountId: account.id,
          userId: member.userId,
          type: 'ADJUST',
          amount: input.amount,
          balanceAfter: updated.availableCredits,
          sourceType: 'ADMIN',
          sourceId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          expiresAt: null,
          createdAt: input.now,
        },
      });
      const configuration = await tx.serviceConfiguration.findFirst({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        select: { id: true },
      });
      if (configuration)
        await tx.serviceConfigurationAudit.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            configurationId: configuration.id,
            action: 'SERVICE_CREDIT_ADJUSTED',
            beforeData: { availableCredits: account.availableCredits },
            afterData: {
              membershipId: member.id,
              amount: input.amount,
              availableCredits: updated.availableCredits,
            },
            reason: input.reason,
            performedByUserId: input.actorUserId,
            occurredAt: input.now,
          },
        });
      return updated;
    });
  }
}
