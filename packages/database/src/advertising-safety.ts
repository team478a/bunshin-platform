import { createHash } from 'node:crypto';
import type { AdvertisingSafetyRepository } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';

export class PrismaAdvertisingSafetyRepository implements AdvertisingSafetyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  hashContent(content: string) {
    return createHash('sha256').update(content).digest('hex');
  }

  private bunshin(input: { workspaceId: string; bunshinId: string; actorUserId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
        workspace: { type: 'PERSONAL', status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  async listEvidence(input: Parameters<AdvertisingSafetyRepository['listEvidence']>[0]) {
    if (!(await this.bunshin(input))) return null;
    return this.client.userEvidence.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createEvidence(input: Parameters<AdvertisingSafetyRepository['createEvidence']>[0]) {
    if (!(await this.bunshin(input))) return null;
    return this.client.userEvidence.create({
      data: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        type: input.type,
        title: input.title,
        claim: input.claim,
        sourceUrl: input.sourceUrl,
        occurredAt: input.occurredAt,
        createdByUserId: input.actorUserId,
      },
    });
  }

  async revokeEvidence(input: Parameters<AdvertisingSafetyRepository['revokeEvidence']>[0]) {
    if (!(await this.bunshin(input))) return null;
    const evidence = await this.client.userEvidence.findFirst({
      where: {
        id: input.evidenceId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
      },
    });
    if (!evidence) return null;
    return this.client.userEvidence.update({
      where: { id: evidence.id },
      data: { status: 'REVOKED', revokedAt: input.revokedAt },
    });
  }

  async prepareReview(input: Parameters<AdvertisingSafetyRepository['prepareReview']>[0]) {
    if (!(await this.bunshin(input))) return null;
    if (input.dailyMissionId) {
      const mission = await this.client.dailyMission.findFirst({
        where: {
          id: input.dailyMissionId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
        },
        select: { id: true },
      });
      if (!mission) return null;
    }
    const evidence = await this.client.userEvidence.findMany({
      where: {
        id: { in: input.evidenceIds },
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (evidence.length !== input.evidenceIds.length) return null;
    if (!input.productPackVersionId)
      return {
        productPackVersionId: null,
        facts: {},
        rules: [],
        evidenceIds: evidence.map((item) => item.id),
      };
    const assignment = await this.client.productPackAssignment.findFirst({
      where: {
        bunshinId: input.bunshinId,
        productPackVersionId: input.productPackVersionId,
        status: 'ACTIVE',
        bunshin: { workspaceId: input.workspaceId, ownerUserId: input.actorUserId },
        productPack: {
          status: 'ACTIVE',
          group: {
            memberships: {
              some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
            },
          },
        },
        productPackVersion: { status: 'PUBLISHED' },
      },
      include: { productPackVersion: { include: { rules: { orderBy: { sortOrder: 'asc' } } } } },
    });
    if (!assignment) return null;
    const facts = assignment.productPackVersion.facts;
    if (!facts || Array.isArray(facts) || typeof facts !== 'object') return null;
    return {
      productPackVersionId: assignment.productPackVersionId,
      facts: facts as Record<string, string>,
      rules: assignment.productPackVersion.rules.map((rule) => ({
        type: rule.type,
        value: rule.value,
        condition: rule.condition,
      })),
      evidenceIds: evidence.map((item) => item.id),
    };
  }

  async saveReview(input: Parameters<AdvertisingSafetyRepository['saveReview']>[0]) {
    if (!(await this.bunshin(input))) return null;
    return this.client.advertisingSafetyReview.create({
      data: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
        productPackVersionId: input.productPackVersionId,
        classification: input.classification,
        evidenceRequirement: input.evidenceRequirement,
        evidenceIds: input.evidenceIds,
        officialClaims: input.officialClaims,
        requiredDisclosures: input.requiredDisclosures,
        issueCodes: input.issueCodes,
        verdict: input.verdict,
        contentHash: input.contentHash,
        reviewedByUserId: input.actorUserId,
      },
    });
  }

  async listReviews(input: Parameters<AdvertisingSafetyRepository['listReviews']>[0]) {
    if (!(await this.bunshin(input))) return null;
    return this.client.advertisingSafetyReview.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      orderBy: { reviewedAt: 'desc' },
      take: 100,
    });
  }
}
