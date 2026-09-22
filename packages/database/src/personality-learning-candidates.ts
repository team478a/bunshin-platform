import type { PersonalityLearningCandidateRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { type PrismaClient, prisma } from './client';
import { stringArray } from './bunshin-records';
export class PrismaPersonalityLearningCandidateRepository implements PersonalityLearningCandidateRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listEligible(input: { limit: number; evidenceLimit: number }) {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100 ||
      !Number.isInteger(input.evidenceLimit) ||
      input.evidenceLimit < 3 ||
      input.evidenceLimit > 100
    )
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'invalid personality learning candidate limit',
      );

    const scanLimit = Math.min(1_000, (input.limit + 1) * 10);
    const rows = await this.client.bunshin.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        workspace: { status: 'ACTIVE' },
        ownerUser: { status: 'ACTIVE' },
        personality: { isNot: null },
        personalityVersions: { some: {} },
        missionFeedback: { some: { rating: 'BAD' } },
        personalityLearningProposals: { none: { status: 'PENDING' } },
      },
      select: {
        workspaceId: true,
        id: true,
        ownerUserId: true,
        workspace: {
          select: { memberships: { where: { status: 'ACTIVE' }, select: { userId: true } } },
        },
        personalityVersions: { orderBy: { version: 'desc' }, take: 1 },
        missionFeedback: {
          where: { rating: 'BAD' },
          orderBy: { updatedAt: 'desc' },
          take: input.evidenceLimit,
          select: {
            id: true,
            rating: true,
            updatedAt: true,
            dailyMission: { select: { format: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: scanLimit,
    });
    const candidates = rows.flatMap((row) => {
      const version = row.personalityVersions[0];
      if (!version || !row.workspace.memberships.some(({ userId }) => userId === row.ownerUserId))
        return [];
      const evidence = row.missionFeedback
        .filter(({ updatedAt }) => updatedAt > version.createdAt)
        .map((feedback) => ({
          feedbackId: feedback.id,
          rating: 'BAD' as const,
          missionFormat: feedback.dailyMission.format,
          occurredAt: feedback.updatedAt,
        }));
      if (evidence.length < 3) return [];
      return [
        {
          workspaceId: row.workspaceId,
          bunshinId: row.id,
          actorUserId: row.ownerUserId,
          basedOnVersionId: version.id,
          currentContent: {
            tone: version.tone,
            formality: version.formality,
            energyLevel: version.energyLevel,
            expertiseLevel: version.expertiseLevel,
            sentenceStyle: version.sentenceStyle,
            firstPerson: version.firstPerson,
            forbiddenExpressions: stringArray(version.forbiddenExpressions, 'forbiddenExpressions'),
            preferredExpressions: stringArray(version.preferredExpressions, 'preferredExpressions'),
            visualDirection: version.visualDirection,
            facePolicy: version.facePolicy,
          },
          evidence,
        },
      ];
    });
    return {
      candidates: candidates.slice(0, input.limit),
      truncated: candidates.length > input.limit || rows.length === scanLimit,
    };
  }
}
