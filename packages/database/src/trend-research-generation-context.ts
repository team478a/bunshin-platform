import type { TrendResearchGenerationContextRepository } from '@bunshin/application';
import { parsePreferredFormats } from '@bunshin/capability-social';
import { type PrismaClient, prisma } from './client';
export class PrismaTrendResearchGenerationContextRepository implements TrendResearchGenerationContextRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async get(input: Parameters<TrendResearchGenerationContextRepository['get']>[0]) {
    const profile = await this.client.socialProfile.findFirst({
      where: {
        id: input.socialProfileId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
        bunshin: {
          status: { not: 'ARCHIVED' },
          ownerUserId: input.actorUserId,
          ownerUser: { status: 'ACTIVE' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
          capabilityAssignments: { some: { capabilityType: 'SOCIAL', status: 'ACTIVE' } },
        },
      },
      include: {
        accountStrategies: {
          where: { status: 'APPROVED' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { concept: true, targetSummary: true },
        },
        bunshin: {
          select: {
            contentPillars: {
              where: { active: true, deletedAt: null },
              orderBy: [{ weight: 'desc' }, { id: 'asc' }],
              take: 5,
              select: { title: true },
            },
          },
        },
      },
    });
    const strategy = profile?.accountStrategies[0];
    if (!profile || !strategy) return null;
    return {
      workspaceId: profile.workspaceId,
      bunshinId: profile.bunshinId,
      actorUserId: input.actorUserId,
      socialProfileId: profile.id,
      platform: profile.platform,
      purpose: profile.purpose,
      preferredFormats: parsePreferredFormats(profile.preferredFormats),
      concept: strategy.concept,
      targetSummary: strategy.targetSummary,
      contentPillars: profile.bunshin.contentPillars.map(({ title }) => title),
    };
  }
}
