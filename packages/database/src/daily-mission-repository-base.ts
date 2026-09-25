import type { DailyMission, MissionTrendContext } from '@bunshin/capability-social';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma, PrismaClient } from './client';

const missionDate = (value: Date) => value.toISOString().slice(0, 10);
export type MissionRow = Prisma.DailyMissionGetPayload<{
  include: {
    content: true;
    trendContext: true;
    contentLinkUsage: { include: { productPack: true; campaign: true } };
  };
}>;
export function dailyMission(row: MissionRow): DailyMission {
  if (!row.content) throw new ApplicationError('INTERNAL_ERROR', 'mission content missing');
  return {
    ...row,
    missionDate: missionDate(row.missionDate),
    status: row.status,
    format: row.format,
    assistanceLevel: row.assistanceLevel,
    content: row.content.contentJson as Record<string, unknown>,
    trendContext: row.trendContext
      ? {
          id: row.trendContext.id,
          candidateId: row.trendContext.candidateId,
          snapshot: row.trendContext.snapshot as unknown as MissionTrendContext['snapshot'],
          createdAt: row.trendContext.createdAt,
        }
      : null,
    linkUsage: row.contentLinkUsage
      ? {
          linkName: row.contentLinkUsage.linkNameSnapshot,
          insertedUrl: row.contentLinkUsage.insertedUrlSnapshot,
          expiresAt: row.contentLinkUsage.expiresAtSnapshot,
          productName: row.contentLinkUsage.productPack.name,
          campaignName: row.contentLinkUsage.campaign?.name ?? null,
          advertisingClassification: row.contentLinkUsage.advertisingClassification,
        }
      : null,
  };
}

export abstract class PrismaDailyMissionRepositoryBase {
  constructor(protected readonly client: PrismaClient) {}

  protected readonly include = {
    content: true,
    trendContext: true,
    contentLinkUsage: { include: { productPack: true, campaign: true } },
  } as const;

  protected async authorized(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
    manage: boolean,
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
    if (!bunshin) return null;
    const role = bunshin.workspace.memberships[0]?.role;
    return !manage || (role && canManageBunshin(role, input.actorUserId, bunshin.ownerUserId))
      ? bunshin
      : null;
  }
  protected async row(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; dailyMissionId: string },
  ) {
    return client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
      include: this.include,
    });
  }
}
