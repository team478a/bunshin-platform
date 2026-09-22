import {
  parsePreferredFormats,
  type SocialAccountStrategy,
  type SocialAccountStrategyRepository,
  type SocialProfile,
  type SocialProfileRepository,
} from '@bunshin/capability-social';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';

function socialProfile(row: Prisma.SocialProfileGetPayload<object>): SocialProfile {
  try {
    return {
      ...row,
      platform: row.platform,
      postingFrequency: row.postingFrequency,
      preferredFormats: parsePreferredFormats(row.preferredFormats),
      defaultAssistanceLevel: row.defaultAssistanceLevel,
      status: row.status,
    };
  } catch (error) {
    throw new ApplicationError('INTERNAL_ERROR', 'invalid persisted social profile', error);
  }
}

export class PrismaSocialProfileRepository implements SocialProfileRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async accessible(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
  ) {
    return client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }

  private async managed(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      include: {
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
    });
    const role = bunshin?.workspace.memberships[0]?.role;
    return bunshin !== null &&
      role !== undefined &&
      canManageBunshin(role, input.actorUserId, bunshin.ownerUserId)
      ? bunshin
      : null;
  }

  async create(input: Parameters<SocialProfileRepository['create']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if ((await this.managed(tx, input)) === null) return null;
        return socialProfile(
          await tx.socialProfile.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              platform: input.platform,
              handle: input.handle ?? null,
              profileUrl: input.profileUrl ?? null,
              purpose: input.purpose,
              postingFrequency: input.postingFrequency,
              preferredFormats: input.preferredFormats,
              defaultAssistanceLevel: input.defaultAssistanceLevel ?? 'READY_TO_USE',
            },
          }),
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApplicationError('CONFLICT', 'social profile already exists', error);
      }
      throw error;
    }
  }

  async list(input: Parameters<SocialProfileRepository['list']>[0]) {
    if ((await this.accessible(this.client, input)) === null) return null;
    const rows = await this.client.socialProfile.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      orderBy: [{ platform: 'asc' }],
    });
    return rows.map(socialProfile);
  }

  async findByPlatform(input: Parameters<SocialProfileRepository['findByPlatform']>[0]) {
    if ((await this.accessible(this.client, input)) === null) return null;
    const row = await this.client.socialProfile.findUnique({
      where: {
        workspaceId_bunshinId_platform: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          platform: input.platform,
        },
      },
    });
    return row === null ? null : socialProfile(row);
  }

  async update(input: Parameters<SocialProfileRepository['update']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.socialProfile.findUnique({
        where: {
          workspaceId_bunshinId_platform: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            platform: input.platform,
          },
        },
        select: { id: true },
      });
      if (row === null) return null;
      return socialProfile(
        await tx.socialProfile.update({
          where: { id: row.id },
          data: {
            ...(input.handle === undefined ? {} : { handle: input.handle }),
            ...(input.profileUrl === undefined ? {} : { profileUrl: input.profileUrl }),
            ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
            ...(input.postingFrequency === undefined
              ? {}
              : { postingFrequency: input.postingFrequency }),
            ...(input.preferredFormats === undefined
              ? {}
              : { preferredFormats: input.preferredFormats }),
            ...(input.defaultAssistanceLevel === undefined
              ? {}
              : { defaultAssistanceLevel: input.defaultAssistanceLevel }),
          },
        }),
      );
    });
  }

  async setActive(input: Parameters<SocialProfileRepository['setActive']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.socialProfile.findUnique({
        where: {
          workspaceId_bunshinId_platform: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            platform: input.platform,
          },
        },
      });
      if (row === null) return null;
      const status = input.active ? 'ACTIVE' : 'INACTIVE';
      if (row.status === status) return socialProfile(row);
      return socialProfile(
        await tx.socialProfile.update({ where: { id: row.id }, data: { status } }),
      );
    });
  }
}

function socialAccountStrategy(
  row: Prisma.SocialAccountStrategyGetPayload<object>,
): SocialAccountStrategy {
  return { ...row, availableMinutes: row.availableMinutes as 3 | 5 | 10 | 20 };
}

export class PrismaSocialAccountStrategyRepository implements SocialAccountStrategyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private async managed(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      include: {
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
    });
    const role = bunshin?.workspace.memberships[0]?.role;
    return bunshin !== null &&
      role !== undefined &&
      canManageBunshin(role, input.actorUserId, bunshin.ownerUserId)
      ? bunshin
      : null;
  }

  private accessible(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }
  async createVersion(input: Parameters<SocialAccountStrategyRepository['createVersion']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if ((await this.managed(tx, input)) === null) return null;
        const profile = await tx.socialProfile.findFirst({
          where: {
            id: input.socialProfileId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            platform: input.platform,
          },
          select: { id: true },
        });
        if (profile === null) return null;
        await tx.$queryRaw<Array<{ lock: string }>>`
          SELECT pg_advisory_xact_lock(hashtext(${input.socialProfileId}))::text AS lock
        `;
        const latest = await tx.socialAccountStrategy.aggregate({
          where: { socialProfileId: input.socialProfileId },
          _max: { version: true },
        });
        const { actorUserId, groupId, status, ...data } = input;
        void actorUserId;
        void groupId;
        return socialAccountStrategy(
          await tx.socialAccountStrategy.create({
            data: {
              ...data,
              destinationDetail: input.destinationDetail ?? null,
              status: status ?? 'DRAFT',
              version: (latest._max.version ?? 0) + 1,
            },
          }),
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'strategy version conflict', error);
      throw error;
    }
  }
  async list(input: Parameters<SocialAccountStrategyRepository['list']>[0]) {
    if ((await this.accessible(input)) === null) return null;
    const profile = await this.client.socialProfile.findFirst({
      where: {
        id: input.socialProfileId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
      select: { id: true },
    });
    if (profile === null) return null;
    return (
      await this.client.socialAccountStrategy.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          socialProfileId: input.socialProfileId,
        },
        orderBy: { version: 'desc' },
      })
    ).map(socialAccountStrategy);
  }
  async approve(input: Parameters<SocialAccountStrategyRepository['approve']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const target = await tx.socialAccountStrategy.findFirst({
        where: { id: input.strategyId, workspaceId: input.workspaceId, bunshinId: input.bunshinId },
        select: { id: true, socialProfileId: true, status: true },
      });
      if (target === null) return null;
      if (target.status === 'SUPERSEDED')
        throw new ApplicationError('CONFLICT', 'superseded strategy cannot be approved');
      if (target.status === 'APPROVED')
        return socialAccountStrategy(
          await tx.socialAccountStrategy.findUniqueOrThrow({ where: { id: target.id } }),
        );
      const now = new Date();
      await tx.socialAccountStrategy.updateMany({
        where: { socialProfileId: target.socialProfileId, status: 'APPROVED' },
        data: { status: 'SUPERSEDED', supersededAt: now },
      });
      return socialAccountStrategy(
        await tx.socialAccountStrategy.update({
          where: { id: target.id },
          data: { status: 'APPROVED', approvedAt: now, supersededAt: null },
        }),
      );
    });
  }
}
