import { businessGrowthActionForMission } from '@bunshin/application';
import type {
  GenerationContextSnapshot,
  GenerationContextSnapshotPayload,
  GenerationContextSnapshotRepository,
  LineMissionNotificationSummaryRepository,
} from '@bunshin/application';
import type {
  MissionContentVariant,
  MissionContentVariantRepository,
} from '@bunshin/capability-social';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';
export class PrismaLineMissionNotificationSummaryRepository implements LineMissionNotificationSummaryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async resolve(input: Parameters<LineMissionNotificationSummaryRepository['resolve']>[0]) {
    const mission = await this.client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        bunshin: {
          status: { not: 'ARCHIVED' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
        },
        socialProfile: { is: { status: 'ACTIVE' } },
        OR: [
          { campaignId: null },
          {
            campaign: {
              is: {
                status: 'OPEN',
                startsAt: { lte: new Date() },
                endsAt: { gt: new Date() },
                group: {
                  status: 'ACTIVE',
                  memberships: {
                    some: {
                      userId: input.actorUserId,
                      status: 'ACTIVE',
                      consentedAt: { not: null },
                    },
                  },
                },
                participations: {
                  some: {
                    participantWorkspaceId: input.workspaceId,
                    userId: input.actorUserId,
                    bunshinId: input.bunshinId,
                    status: 'ACCEPTED',
                  },
                },
                productPackVersion: {
                  status: 'PUBLISHED',
                  assignments: {
                    some: { bunshinId: input.bunshinId, status: 'ACTIVE' },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        missionDate: true,
        format: true,
        estimatedMinutes: true,
        topic: true,
        trendContext: { select: { id: true } },
        socialProfile: { select: { platform: true } },
        classification: true,
        campaign: { select: { name: true } },
        contentLinkUsage: { select: { id: true } },
        bunshin: { select: { groupId: true } },
      },
    });
    if (!mission?.socialProfile) return null;
    const businessProfile = mission.bunshin.groupId
      ? await this.client.serviceMemberBusinessProfile.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: mission.bunshin.groupId,
            userId: input.actorUserId,
            groupMembership: { status: 'ACTIVE' },
          },
          select: { id: true, createdAt: true },
        })
      : null;
    return {
      platform: mission.socialProfile.platform,
      format: mission.format,
      estimatedMinutes: mission.estimatedMinutes,
      topic: mission.topic,
      researched: mission.trendContext !== null,
      ...(businessProfile
        ? {
            businessAction: businessGrowthActionForMission({
              missionDate: mission.missionDate.toISOString().slice(0, 10),
              topic: mission.topic,
              programStartedAt: businessProfile.createdAt,
            }),
          }
        : {}),
      ...(mission.contentLinkUsage ? { externalLinkIncluded: true } : {}),
      ...(mission.campaign && mission.classification !== 'ORGANIC'
        ? { campaign: { name: mission.campaign.name, classification: mission.classification } }
        : {}),
    };
  }
}

export class PrismaDailyMissionGenerationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async claim(input: {
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    missionDate: string;
    idempotencyKey: string;
  }) {
    const authorized = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
    if (!authorized) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    const missionDate = new Date(`${input.missionDate}T00:00:00.000Z`);
    try {
      return {
        record: await this.client.dailyMissionGeneration.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            actorUserId: input.actorUserId,
            idempotencyKey: input.idempotencyKey,
            missionDate,
            status: 'PENDING',
          },
        }),
        acquired: true,
      };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.client.dailyMissionGeneration.findFirst({
        where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId, missionDate },
      });
      if (!existing) throw error;
      if (existing.actorUserId !== input.actorUserId)
        throw new ApplicationError('CONFLICT', 'daily mission generation already claimed');
      if (existing.status === 'FAILED') {
        return {
          record: await this.client.dailyMissionGeneration.update({
            where: { id: existing.id },
            data: { status: 'PENDING', idempotencyKey: input.idempotencyKey, errorCategory: null },
          }),
          acquired: true,
        };
      }
      if (existing.idempotencyKey !== input.idempotencyKey)
        throw new ApplicationError('CONFLICT', 'daily mission generation already claimed');
      return { record: existing, acquired: false };
    }
  }

  async complete(input: {
    id: string;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    dailyMissionId: string;
  }) {
    const result = await this.client.dailyMissionGeneration.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
      },
      data: { status: 'COMPLETED', dailyMissionId: input.dailyMissionId, errorCategory: null },
    });
    if (result.count !== 1) throw new ApplicationError('NOT_FOUND', 'generation not found');
  }

  async fail(input: {
    id: string;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    errorCategory: string;
  }) {
    const result = await this.client.dailyMissionGeneration.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
      },
      data: { status: 'FAILED', errorCategory: input.errorCategory },
    });
    if (result.count !== 1) throw new ApplicationError('NOT_FOUND', 'generation not found');
  }
}

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
  }): MissionContentVariant {
    return {
      ...row,
      content: row.contentJson as Record<string, unknown>,
      selectedAt: row.selections[0]?.selectedAt ?? null,
    };
  }

  private variantInclude = {
    selections: { orderBy: { selectedAt: 'desc' as const }, take: 1 },
  } as const;

  async claim(input: Parameters<MissionContentVariantRepository['claim']>[0]) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.workspaceId}:${input.bunshinId}:${input.dailyMissionId}`}::text, 0))`;
      if (!(await this.authorizedMission(tx, input))) return null;
      const existingVariant = await tx.missionContentVariant.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
        },
        select: { id: true },
      });
      if (existingVariant)
        throw new ApplicationError('CONFLICT', 'mission content variant limit reached');
      const existing = await tx.missionContentVariantGeneration.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) return { acquired: false, generation: existing };
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
      return { acquired: true, generation };
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
      if (
        await tx.missionContentVariant.findFirst({
          where: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
          },
          select: { id: true },
        })
      )
        throw new ApplicationError('CONFLICT', 'mission content variant limit reached');
      const variant = await tx.missionContentVariant.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          sequence: 1,
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
        },
      });
      return this.variant(variant);
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

function generationContextSnapshot(
  row: Prisma.GenerationContextSnapshotGetPayload<object>,
): GenerationContextSnapshot {
  if (row.schemaVersion !== 1) {
    throw new ApplicationError('INTERNAL_ERROR', 'unsupported generation context schema version');
  }
  return {
    ...row,
    schemaVersion: 1,
    payload: row.payload as unknown as GenerationContextSnapshotPayload,
  };
}

export class PrismaGenerationContextSnapshotRepository implements GenerationContextSnapshotRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async authorizedMission(
    input: Parameters<GenerationContextSnapshotRepository['find']>[0],
  ) {
    const mission = await this.client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        bunshin: {
          status: { not: 'ARCHIVED' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
        },
      },
      select: {
        id: true,
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

  async create(input: Parameters<GenerationContextSnapshotRepository['create']>[0]) {
    const mission = await this.authorizedMission(input);
    if (!mission) return null;
    try {
      const row = await this.client.generationContextSnapshot.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          schemaVersion: input.schemaVersion,
          payload: input.payload as unknown as Prisma.InputJsonValue,
          generatedAt: input.generatedAt,
        },
      });
      return generationContextSnapshot(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApplicationError('CONFLICT', 'generation context already exists');
      }
      throw error;
    }
  }

  async find(input: Parameters<GenerationContextSnapshotRepository['find']>[0]) {
    if (!(await this.authorizedMission(input))) return null;
    const row = await this.client.generationContextSnapshot.findFirst({
      where: {
        dailyMissionId: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
    });
    return row ? generationContextSnapshot(row) : null;
  }
}
