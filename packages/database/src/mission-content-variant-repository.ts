import type {
  MissionContentVariant,
  MissionContentVariantGeneration,
  MissionContentVariantRepository,
} from '@bunshin/capability-social';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma } from './client';
import { type PrismaClient, prisma } from './client';

const MAX_PHOTO_FIRST_CONFIRMATION_VARIANTS = 5;

export class PrismaMissionContentVariantRepository implements MissionContentVariantRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async authorizedMission(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      bunshinId: string;
      actorUserId: string;
      dailyMissionId: string;
    },
  ) {
    const mission = await client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        bunshin: {
          groupId: input.groupId ?? null,
          ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
          status: { not: 'ARCHIVED' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
        },
      },
      select: {
        id: true,
        format: true,
        bunshin: {
          select: {
            ownerUserId: true,
            workspace: {
              select: {
                memberships: {
                  where: { userId: input.actorUserId, status: 'ACTIVE' },
                  select: { role: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    const role = mission?.bunshin.workspace.memberships[0]?.role;
    return mission && role && canManageBunshin(role, input.actorUserId, mission.bunshin.ownerUserId)
      ? mission
      : null;
  }

  private variant(row: {
    id: string;
    workspaceId: string;
    bunshinId: string;
    dailyMissionId: string;
    actorUserId: string;
    sequence: number;
    format: MissionContentVariant['format'];
    contentJson: Prisma.JsonValue;
    qualityScore: number;
    model: string;
    promptVersion: string;
    inputTokens: number | null;
    outputTokens: number | null;
    estimatedCostMicros: bigint | null;
    latencyMs: number;
    createdAt: Date;
    selections: Array<{ selectedAt: Date }>;
    photoFirstMetadata: null | {
      photoMemoryId: string;
      analysisJson: Prisma.JsonValue;
      planningJson: Prisma.JsonValue;
      analyzerModel: string;
      analyzerPromptVersion: string;
    };
  }): MissionContentVariant {
    return {
      ...row,
      content: row.contentJson as Record<string, unknown>,
      selectedAt: row.selections[0]?.selectedAt ?? null,
      photoFirst: row.photoFirstMetadata
        ? {
            photoMemoryId: row.photoFirstMetadata.photoMemoryId,
            analysis: row.photoFirstMetadata.analysisJson as unknown as NonNullable<
              MissionContentVariant['photoFirst']
            >['analysis'],
            planning: row.photoFirstMetadata.planningJson as unknown as NonNullable<
              MissionContentVariant['photoFirst']
            >['planning'],
            analyzerModel: row.photoFirstMetadata.analyzerModel,
            analyzerPromptVersion: row.photoFirstMetadata.analyzerPromptVersion,
          }
        : null,
    };
  }

  private variantInclude = {
    selections: { orderBy: { selectedAt: 'desc' as const }, take: 1 },
    photoFirstMetadata: true,
  } as const;

  private generation(
    row: Prisma.MissionContentVariantGenerationGetPayload<object>,
  ): MissionContentVariantGeneration {
    return {
      ...row,
      qualityVerdict: row.qualityVerdict as 'PASS' | 'REVISE' | 'REJECT' | null,
    };
  }

  async claim(input: Parameters<MissionContentVariantRepository['claim']>[0]) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.workspaceId}:${input.bunshinId}:${input.dailyMissionId}`}::text, 0))`;
      if (!(await this.authorizedMission(tx, input))) return null;
      const existing = await tx.missionContentVariantGeneration.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) return { acquired: false, generation: this.generation(existing) };
      const latestVariant = await tx.missionContentVariant.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
        },
        orderBy: { sequence: 'desc' },
        select: { id: true, sequence: true, photoFirstMetadata: { select: { id: true } } },
      });
      if (!input.sourceVariantId && latestVariant)
        throw new ApplicationError('CONFLICT', 'mission content variant limit reached');
      if (
        input.sourceVariantId &&
        (!latestVariant ||
          latestVariant.id !== input.sourceVariantId ||
          !latestVariant.photoFirstMetadata)
      )
        throw new ApplicationError('CONFLICT', 'photo confirmation source is no longer current');
      if (
        input.sourceVariantId &&
        latestVariant &&
        latestVariant.sequence >= MAX_PHOTO_FIRST_CONFIRMATION_VARIANTS
      )
        throw new ApplicationError('CONFLICT', 'photo confirmation limit reached');
      const active = await tx.missionContentVariantGeneration.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          status: 'PROCESSING',
        },
        select: { id: true },
      });
      if (active)
        throw new ApplicationError('CONFLICT', 'mission content variant generation is in progress');
      const generation = await tx.missionContentVariantGeneration.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return { acquired: true, generation: this.generation(generation) };
    });
  }

  async complete(input: Parameters<MissionContentVariantRepository['complete']>[0]) {
    return this.client.$transaction(async (tx) => {
      const mission = await this.authorizedMission(tx, input);
      if (!mission || mission.format !== input.format) return null;
      const generation = await tx.missionContentVariantGeneration.findFirst({
        where: {
          id: input.generationId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          status: 'PROCESSING',
        },
      });
      if (!generation) return null;
      const latestVariant = await tx.missionContentVariant.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
        },
        orderBy: { sequence: 'desc' },
        select: { id: true, sequence: true, photoFirstMetadata: { select: { id: true } } },
      });
      if (!input.sourceVariantId && latestVariant)
        throw new ApplicationError('CONFLICT', 'mission content variant limit reached');
      if (
        input.sourceVariantId &&
        (!latestVariant ||
          latestVariant.id !== input.sourceVariantId ||
          !latestVariant.photoFirstMetadata)
      )
        throw new ApplicationError('CONFLICT', 'photo confirmation source is no longer current');
      if (
        input.sourceVariantId &&
        latestVariant &&
        latestVariant.sequence >= MAX_PHOTO_FIRST_CONFIRMATION_VARIANTS
      )
        throw new ApplicationError('CONFLICT', 'photo confirmation limit reached');
      const variant = await tx.missionContentVariant.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          sequence: (latestVariant?.sequence ?? 0) + 1,
          format: input.format,
          contentJson: input.content as Prisma.InputJsonValue,
          qualityScore: input.qualityScore,
          model: input.model,
          promptVersion: input.promptVersion,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          estimatedCostMicros: input.estimatedCostMicros,
          latencyMs: input.latencyMs,
        },
        include: this.variantInclude,
      });
      if (input.photoFirst)
        await tx.missionContentVariantPhotoFirstMetadata.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
            variantId: variant.id,
            photoMemoryId: input.photoFirst.photoMemoryId,
            actorUserId: input.actorUserId,
            analysisJson: input.photoFirst.analysis as unknown as Prisma.InputJsonValue,
            planningJson: input.photoFirst.planning as unknown as Prisma.InputJsonValue,
            analyzerModel: input.photoFirst.analyzerModel,
            analyzerPromptVersion: input.photoFirst.analyzerPromptVersion,
          },
        });
      await tx.missionContentVariantGeneration.update({
        where: { id: generation.id },
        data: {
          status: 'SUCCEEDED',
          variantId: variant.id,
          model: input.model,
          promptVersion: input.promptVersion,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          estimatedCostMicros: input.estimatedCostMicros,
          latencyMs: input.latencyMs,
          errorCategory: null,
          qualityVerdict: input.qualityAudit.verdict,
          qualityScore: input.qualityAudit.score,
          qualityIssueCodes: input.qualityAudit.issueCodes,
          qualityRepairCount: input.qualityAudit.repairCount,
        },
      });
      const completed = await tx.missionContentVariant.findUnique({
        where: { id: variant.id },
        include: this.variantInclude,
      });
      return completed ? this.variant(completed) : null;
    });
  }

  async fail(input: Parameters<MissionContentVariantRepository['fail']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorizedMission(tx, input))) return null;
      const result = await tx.missionContentVariantGeneration.updateMany({
        where: {
          id: input.generationId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          status: 'PROCESSING',
        },
        data: {
          status: 'FAILED',
          errorCategory: input.errorCategory,
          ...(input.model === undefined ? {} : { model: input.model }),
          ...(input.promptVersion === undefined ? {} : { promptVersion: input.promptVersion }),
          ...(input.inputTokens === undefined ? {} : { inputTokens: input.inputTokens }),
          ...(input.outputTokens === undefined ? {} : { outputTokens: input.outputTokens }),
          ...(input.estimatedCostMicros === undefined
            ? {}
            : { estimatedCostMicros: input.estimatedCostMicros }),
          ...(input.latencyMs === undefined ? {} : { latencyMs: input.latencyMs }),
          qualityVerdict: input.qualityAudit.verdict,
          qualityScore: input.qualityAudit.score,
          qualityIssueCodes: input.qualityAudit.issueCodes,
          qualityRepairCount: input.qualityAudit.repairCount,
        },
      });
      return result.count === 1;
    });
  }

  async list(input: Parameters<MissionContentVariantRepository['list']>[0]) {
    if (!(await this.authorizedMission(this.client, input))) return null;
    return (
      await this.client.missionContentVariant.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
        },
        orderBy: { sequence: 'asc' },
        include: this.variantInclude,
      })
    ).map((row) => this.variant(row));
  }

  async select(input: Parameters<MissionContentVariantRepository['select']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorizedMission(tx, input))) return null;
      const variant = await tx.missionContentVariant.findFirst({
        where: {
          id: input.variantId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
        },
      });
      if (!variant) return null;
      await tx.missionContentVariantSelection.upsert({
        where: {
          workspaceId_bunshinId_actorUserId_idempotencyKey: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            actorUserId: input.actorUserId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          variantId: input.variantId,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          selectedAt: input.selectedAt,
        },
        update: {},
      });
      const selected = await tx.missionContentVariant.findUnique({
        where: { id: variant.id },
        include: this.variantInclude,
      });
      return selected ? this.variant(selected) : null;
    });
  }
}
