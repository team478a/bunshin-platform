import type { MissionDeepLinkState, MissionDeepLinkStateRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';

function lineMissionScope(input: {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
  dailyMissionId: string;
}): Prisma.BunshinWhereInput {
  return {
    id: input.bunshinId,
    workspaceId: input.workspaceId,
    status: { not: 'ARCHIVED' },
    ownerUser: { status: 'ACTIVE' },
    workspace: {
      status: 'ACTIVE',
      memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
    },
    OR: [
      { ownerUserId: input.actorUserId },
      {
        workspace: {
          memberships: {
            some: {
              userId: input.actorUserId,
              status: 'ACTIVE',
              role: { in: ['OWNER', 'ADMIN'] },
            },
          },
        },
      },
    ],
    dailyMissions: { some: { id: input.dailyMissionId } },
  };
}

function missionDeepLinkState(
  row: Prisma.MissionDeepLinkStateGetPayload<object>,
): MissionDeepLinkState {
  return row;
}

export class PrismaMissionDeepLinkStateRepository implements MissionDeepLinkStateRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async create(input: Parameters<MissionDeepLinkStateRepository['create']>[0]) {
    const accessible = await this.client.bunshin.findFirst({
      where: lineMissionScope(input),
      select: { id: true },
    });
    if (!accessible) return null;
    try {
      return missionDeepLinkState(
        await this.client.missionDeepLinkState.create({
          data: {
            id: input.id,
            environment: input.environment,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            userId: input.actorUserId,
            dailyMissionId: input.dailyMissionId,
            keyVersion: input.keyVersion,
            expiresAt: input.expiresAt,
          },
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'Mission deep link state already exists');
      throw error;
    }
  }

  async consume(input: Parameters<MissionDeepLinkStateRepository['consume']>[0]) {
    return this.client.$transaction(async (tx) => {
      const state = await tx.missionDeepLinkState.findFirst({
        where: {
          id: input.id,
          environment: input.environment,
          userId: input.actorUserId,
          keyVersion: input.keyVersion,
          expiresAt: input.expiresAt,
          user: { status: 'ACTIVE' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
          bunshin: {
            status: { not: 'ARCHIVED' },
            OR: [
              { ownerUserId: input.actorUserId },
              {
                workspace: {
                  memberships: {
                    some: {
                      userId: input.actorUserId,
                      status: 'ACTIVE',
                      role: { in: ['OWNER', 'ADMIN'] },
                    },
                  },
                },
              },
            ],
          },
        },
      });
      if (!state) return null;
      if (state.consumedAt) return missionDeepLinkState(state);
      const claimed = await tx.missionDeepLinkState.updateMany({
        where: {
          id: state.id,
          environment: input.environment,
          userId: input.actorUserId,
          keyVersion: input.keyVersion,
          expiresAt: input.expiresAt,
          consumedAt: null,
        },
        data: { consumedAt: input.now },
      });
      if (claimed.count !== 1) return null;
      return missionDeepLinkState({ ...state, consumedAt: input.now });
    });
  }
}
