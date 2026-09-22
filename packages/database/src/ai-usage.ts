import type {
  AiUsageEventRepository,
  OrganizationAiGenerationReservationRepository,
  RecordAiUsageInput,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { type PrismaClient, prisma } from './client';
export class PrismaAiUsageEventRepository implements AiUsageEventRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async record(input: RecordAiUsageInput): Promise<void> {
    const accessible = input.bunshinId
      ? await this.client.bunshin.findFirst({
          where: {
            id: input.bunshinId,
            workspaceId: input.workspaceId,
            workspace: {
              memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
            },
          },
          select: { id: true },
        })
      : await this.client.workspaceMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
    if (accessible === null) throw new ApplicationError('NOT_FOUND', 'AI usage scope not found');
    await this.client.aiUsageEvent.upsert({
      where: {
        workspaceId_actorUserId_idempotencyKey: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
        taskType: input.taskType,
        provider: input.provider,
        model: input.model,
        promptVersion: input.promptVersion,
        status: input.status,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        latencyMs: input.latencyMs,
        idempotencyKey: input.idempotencyKey,
        estimatedCostUsdMicros:
          input.estimatedCostUsdMicros === undefined || input.estimatedCostUsdMicros === null
            ? null
            : BigInt(input.estimatedCostUsdMicros),
        pricingVersion: input.pricingVersion ?? null,
        errorCode: input.errorCode ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      },
      update: {},
    });
  }
}

export class PrismaOrganizationAiGenerationReservationRepository implements OrganizationAiGenerationReservationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async reserve(input: Parameters<OrganizationAiGenerationReservationRepository['reserve']>[0]) {
    const monthKey = `${input.now.getUTCFullYear()}-${String(input.now.getUTCMonth() + 1).padStart(2, '0')}`;
    return this.client.$transaction(
      async (tx) => {
        const entitlement = await tx.organizationEntitlement.findUnique({
          where: { workspaceId: input.workspaceId },
          select: {
            monthlyAiGenerationLimit: true,
            suspended: true,
            startsAt: true,
            endsAt: true,
          },
        });
        if (!entitlement || entitlement.monthlyAiGenerationLimit === null)
          return { status: 'UNLIMITED' as const, reservationId: null };
        if (
          entitlement.suspended ||
          (entitlement.startsAt && entitlement.startsAt > input.now) ||
          (entitlement.endsAt && entitlement.endsAt <= input.now)
        )
          return { status: 'EXHAUSTED' as const, reservationId: null };

        const existing = await tx.organizationAiGenerationReservation.findUnique({
          where: {
            workspaceId_operationKey: {
              workspaceId: input.workspaceId,
              operationKey: input.operationKey,
            },
          },
        });
        if (
          existing?.status === 'CONSUMED' ||
          (existing?.status === 'RESERVED' && existing.expiresAt > input.now)
        )
          return { status: 'ALREADY_RESERVED' as const, reservationId: existing.id };

        const used = await tx.organizationAiGenerationReservation.count({
          where: {
            workspaceId: input.workspaceId,
            monthKey,
            OR: [{ status: 'CONSUMED' }, { status: 'RESERVED', expiresAt: { gt: input.now } }],
          },
        });
        if (used >= entitlement.monthlyAiGenerationLimit)
          return { status: 'EXHAUSTED' as const, reservationId: null };

        const reserved = await tx.organizationAiGenerationReservation.upsert({
          where: {
            workspaceId_operationKey: {
              workspaceId: input.workspaceId,
              operationKey: input.operationKey,
            },
          },
          create: {
            workspaceId: input.workspaceId,
            monthKey,
            operationKey: input.operationKey,
            expiresAt: input.expiresAt,
          },
          update: {
            monthKey,
            status: 'RESERVED',
            expiresAt: input.expiresAt,
            consumedAt: null,
            releasedAt: null,
          },
          select: { id: true },
        });
        return { status: 'RESERVED' as const, reservationId: reserved.id };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async finish(input: Parameters<OrganizationAiGenerationReservationRepository['finish']>[0]) {
    const changed = await this.client.organizationAiGenerationReservation.updateMany({
      where: {
        workspaceId: input.workspaceId,
        operationKey: input.operationKey,
        status: 'RESERVED',
      },
      data:
        input.outcome === 'CONSUMED'
          ? { status: 'CONSUMED', consumedAt: input.now }
          : { status: 'RELEASED', releasedAt: input.now },
    });
    return changed.count === 1;
  }
}
