import type {
  GenerationContextSnapshot,
  GenerationContextSnapshotPayload,
  GenerationContextSnapshotRepository,
} from '@bunshin/application';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';

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
