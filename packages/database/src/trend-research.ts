import type { TrendResearchExpiryRepository } from '@bunshin/application';
import type {
  TrendIdeaCandidate,
  TrendResearchRepository,
  TrendResearchRun,
} from '@bunshin/capability-social';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';

const trendDateString = (value: Date) => value.toISOString().slice(0, 10);
function trendCandidate(
  row: Prisma.TrendIdeaCandidateGetPayload<{ include: { evidenceLinks: true } }>,
): TrendIdeaCandidate {
  return { ...row, evidenceIds: row.evidenceLinks.map(({ evidenceId }) => evidenceId) };
}
function trendRun(
  row: Prisma.TrendResearchRunGetPayload<{
    include: { evidence: true; candidates: { include: { evidenceLinks: true } } };
  }>,
): TrendResearchRun {
  return {
    ...row,
    periodStart: trendDateString(row.periodStart),
    periodEnd: trendDateString(row.periodEnd),
    completedAt: row.completedAt!,
    evidence: row.evidence,
    candidates: row.candidates.map(trendCandidate),
  };
}
export class PrismaTrendResearchRepository implements TrendResearchRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private accessible(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    return this.client.bunshin.findFirst({
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
  }
  async createCompleted(input: Parameters<TrendResearchRepository['createCompleted']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const bunshin = await tx.bunshin.findFirst({
          where: {
            id: input.bunshinId,
            workspaceId: input.workspaceId,
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
        if (!bunshin || !role || !canManageBunshin(role, input.actorUserId, bunshin.ownerUserId))
          return null;
        const profile = await tx.socialProfile.findFirst({
          where: {
            id: input.socialProfileId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            platform: input.platform,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (!profile) return null;
        const run = await tx.trendResearchRun.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            socialProfileId: input.socialProfileId,
            periodStart: new Date(`${input.periodStart}T00:00:00.000Z`),
            periodEnd: new Date(`${input.periodEnd}T00:00:00.000Z`),
            queryVersion: input.queryVersion,
            providerKey: input.providerKey,
            status: 'COMPLETED',
            completedAt: input.completedAt,
            expiresAt: input.expiresAt,
          },
        });
        const evidenceIds = new Map<string, string>();
        for (const item of input.evidence) {
          const created = await tx.trendEvidence.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              researchRunId: run.id,
              sourceType: item.sourceType,
              sourceUrl: item.sourceUrl,
              sourceTitle: item.sourceTitle,
              publishedAt: item.publishedAt ?? null,
              retrievedAt: item.retrievedAt,
              summary: item.summary,
              evidenceHash: item.evidenceHash,
              status: 'ACTIVE',
              expiresAt: item.expiresAt,
            },
          });
          evidenceIds.set(item.key, created.id);
        }
        for (const item of input.candidates) {
          const created = await tx.trendIdeaCandidate.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              socialProfileId: input.socialProfileId,
              researchRunId: run.id,
              platform: item.platform,
              topic: item.topic,
              hook: item.hook,
              whyNow: item.whyNow,
              fitReason: item.fitReason,
              suggestedFormat: item.suggestedFormat,
              estimatedMinutes: item.estimatedMinutes,
              freshnessScore: item.freshnessScore,
              fitScore: item.fitScore,
              feasibilityScore: item.feasibilityScore,
              safetyStatus: item.safetyStatus,
              status: 'PROPOSED',
              expiresAt: item.expiresAt,
            },
          });
          await tx.trendIdeaCandidateEvidence.createMany({
            data: item.evidenceKeys.map((key) => ({
              candidateId: created.id,
              evidenceId: evidenceIds.get(key)!,
            })),
          });
        }
        return trendRun(
          await tx.trendResearchRun.findUniqueOrThrow({
            where: { id: run.id },
            include: { evidence: true, candidates: { include: { evidenceLinks: true } } },
          }),
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'trend research already exists', error);
      throw error;
    }
  }
  async listActive(input: Parameters<TrendResearchRepository['listActive']>[0]) {
    if ((await this.accessible(input)) === null) return null;
    const profile = await this.client.socialProfile.findFirst({
      where: {
        id: input.socialProfileId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        bunshin: {
          OR: [
            { groupId: null },
            { group: { serviceConfiguration: { trendResearchEnabled: true } } },
          ],
        },
      },
      select: { id: true },
    });
    if (!profile) return null;
    const rows = await this.client.trendIdeaCandidate.findMany({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        socialProfileId: input.socialProfileId,
        status: { in: ['PROPOSED', 'SELECTED'] },
        expiresAt: { gt: input.at },
        safetyStatus: { not: 'REJECTED' },
        researchRun: { status: 'COMPLETED', expiresAt: { gt: input.at } },
        evidenceLinks: { some: { evidence: { status: 'ACTIVE', expiresAt: { gt: input.at } } } },
      },
      include: { evidenceLinks: true },
      orderBy: [{ fitScore: 'desc' }, { freshnessScore: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(trendCandidate);
  }
}

export class PrismaTrendResearchExpiryRepository implements TrendResearchExpiryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async expire(input: Parameters<TrendResearchExpiryRepository['expire']>[0]) {
    const scope = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        workspace: {
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
      },
      select: { id: true },
    });
    if (!scope) return null;
    return this.client.$transaction(async (tx) => {
      const candidates = await tx.trendIdeaCandidate.updateMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: { in: ['PROPOSED', 'SELECTED'] },
          expiresAt: { lte: input.at },
        },
        data: { status: 'EXPIRED' },
      });
      const evidence = await tx.trendEvidence.updateMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'ACTIVE',
          expiresAt: { lte: input.at },
        },
        data: { status: 'EXPIRED' },
      });
      const runs = await tx.trendResearchRun.updateMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'COMPLETED',
          expiresAt: { lte: input.at },
        },
        data: { status: 'EXPIRED' },
      });
      return { runs: runs.count, evidence: evidence.count, candidates: candidates.count };
    });
  }
}
