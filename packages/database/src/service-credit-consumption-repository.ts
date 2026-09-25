import type {
  ServiceCreditConsumptionRepository,
  ServiceCreditConsumptionResult,
} from '@bunshin/application';
import { type PrismaClient, prisma } from './client';

export class PrismaServiceCreditConsumptionRepository implements ServiceCreditConsumptionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async consumeForSocialImage(
    input: Parameters<ServiceCreditConsumptionRepository['consumeForSocialImage']>[0],
  ): Promise<ServiceCreditConsumptionResult> {
    return this.client.$transaction(async (tx) => {
      const account = await tx.serviceCreditAccount.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          userId: input.userId,
        },
        select: { id: true, availableCredits: true },
      });
      if (account === null) return { status: 'NOT_CONFIGURED' };

      const existing = await tx.serviceCreditLedger.findUnique({
        where: {
          accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey },
        },
        select: { type: true, balanceAfter: true },
      });
      if (existing?.type === 'CONSUME')
        return { status: 'CONSUMED', availableCredits: existing.balanceAfter };
      if (existing !== null) throw new Error('service credit idempotency key conflict');

      const consumed = await tx.serviceCreditAccount.updateMany({
        where: {
          id: account.id,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          userId: input.userId,
          availableCredits: { gte: 1 },
        },
        data: { availableCredits: { decrement: 1 }, revision: { increment: 1 } },
      });
      if (consumed.count === 0) return { status: 'INSUFFICIENT' };
      const updated = await tx.serviceCreditAccount.findUniqueOrThrow({
        where: { id: account.id },
        select: { availableCredits: true },
      });
      await tx.serviceCreditLedger.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          accountId: account.id,
          userId: input.userId,
          type: 'CONSUME',
          amount: -1,
          balanceAfter: updated.availableCredits,
          sourceType: 'SYSTEM',
          sourceId: input.imageRequestId,
          idempotencyKey: input.idempotencyKey,
          expiresAt: null,
          createdAt: input.now,
        },
      });
      return { status: 'CONSUMED', availableCredits: updated.availableCredits };
    });
  }

  async refundSocialImage(
    input: Parameters<ServiceCreditConsumptionRepository['refundSocialImage']>[0],
  ): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const account = await tx.serviceCreditAccount.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          userId: input.userId,
        },
        select: { id: true },
      });
      if (account === null) return;
      const alreadyRefunded = await tx.serviceCreditLedger.findUnique({
        where: {
          accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey },
        },
        select: { id: true },
      });
      if (alreadyRefunded !== null) return;
      const sourceConsumption = await tx.serviceCreditLedger.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          accountId: account.id,
          userId: input.userId,
          type: 'CONSUME',
          sourceId: input.imageRequestId,
        },
        select: { id: true },
      });
      if (sourceConsumption === null) return;
      const updated = await tx.serviceCreditAccount.update({
        where: { id: account.id },
        data: { availableCredits: { increment: 1 }, revision: { increment: 1 } },
        select: { availableCredits: true },
      });
      await tx.serviceCreditLedger.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          accountId: account.id,
          userId: input.userId,
          type: 'REFUND',
          amount: 1,
          balanceAfter: updated.availableCredits,
          sourceType: 'SYSTEM',
          sourceId: input.imageRequestId,
          idempotencyKey: input.idempotencyKey,
          expiresAt: null,
          createdAt: input.now,
        },
      });
    });
  }
}
