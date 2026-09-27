import type {
  CreateFortuneReadingResult,
  FortuneFeedbackIssue,
  FortuneOrientation,
  FortuneAiGenerationClaim,
  FortuneAiReadingResult,
  FortuneReadingView,
  FortuneTheme,
} from '@bunshin/capability-fortune';
import type { PrismaClient } from '@prisma/client';
import { dateOnly, fortuneReadingView, fortuneTarget } from './fortune-shared';

export class PrismaFortuneGenerationRepository {
  constructor(private readonly db: PrismaClient) {}

  async findReadingForDate(input: {
    serviceSlug: string;
    actorUserId: string;
    localDate: string;
  }): Promise<FortuneReadingView | null> {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const participant = await this.db.fortuneParticipant.findFirst({
      where: { serviceSettingId: scope.id, userId: input.actorUserId },
    });
    if (!participant) return null;
    const reading = await this.db.fortuneReading.findUnique({
      where: {
        serviceSettingId_participantId_localDate: {
          serviceSettingId: scope.id,
          participantId: participant.id,
          localDate: dateOnly(input.localDate),
        },
      },
    });
    return reading ? fortuneReadingView(this.db, reading) : null;
  }

  async createBasicReading(input: {
    serviceSlug: string;
    actorUserId: string;
    localDate: string;
    theme: FortuneTheme;
    cardCode: string;
    orientation: FortuneOrientation;
  }): Promise<CreateFortuneReadingResult> {
    return this.db.$transaction(async (tx) => {
      const scope = await fortuneTarget(tx, input.serviceSlug, input.actorUserId);
      if (!scope) return { kind: 'NOT_AVAILABLE' };
      const participant = await tx.fortuneParticipant.findFirst({
        where: { serviceSettingId: scope.id, userId: input.actorUserId },
      });
      if (!participant) return { kind: 'NOT_PARTICIPANT' };
      const knowledge = await tx.fortuneKnowledgeVersion.findFirst({
        where: {
          serviceSettingId: scope.id,
          status: 'APPROVED',
          cardMeanings: {
            some: {
              cardCode: input.cardCode,
              orientation: input.orientation,
              theme: input.theme,
              safetyReviewed: true,
            },
          },
        },
        orderBy: { version: 'desc' },
        include: {
          cardMeanings: {
            where: {
              cardCode: input.cardCode,
              orientation: input.orientation,
              theme: input.theme,
              safetyReviewed: true,
            },
            take: 1,
          },
        },
      });
      const meaning = knowledge?.cardMeanings[0];
      if (!knowledge || !meaning) return { kind: 'KNOWLEDGE_NOT_READY' };
      const reading = await tx.fortuneReading.upsert({
        where: {
          serviceSettingId_participantId_localDate: {
            serviceSettingId: scope.id,
            participantId: participant.id,
            localDate: dateOnly(input.localDate),
          },
        },
        update: {},
        create: {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          serviceSettingId: scope.id,
          participantId: participant.id,
          memberUserId: input.actorUserId,
          knowledgeVersionId: knowledge.id,
          localDate: dateOnly(input.localDate),
          theme: input.theme,
          cardCode: input.cardCode,
          orientation: input.orientation,
          status: 'READY_BASIC',
          readingText: meaning.body,
          actionStep: meaning.actionStep,
          promptVersion: knowledge.promptVersion,
          generatedAt: new Date(),
        },
      });
      return { kind: 'READY', reading: await fortuneReadingView(tx, reading) };
    });
  }

  async claimAiGeneration(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
  }): Promise<FortuneAiGenerationClaim | null> {
    return this.db.$transaction(async (tx) => {
      const scope = await fortuneTarget(tx, input.serviceSlug, input.actorUserId);
      if (!scope || !scope.aiEnabled) return null;
      const claimed = await tx.fortuneReading.updateMany({
        where: {
          id: input.readingId,
          serviceSettingId: scope.id,
          memberUserId: input.actorUserId,
          status: 'READY_BASIC',
        },
        data: { status: 'GENERATING', failureCode: null },
      });
      if (claimed.count !== 1) return null;
      const reading = await tx.fortuneReading.findFirst({
        where: {
          id: input.readingId,
          serviceSettingId: scope.id,
          memberUserId: input.actorUserId,
        },
      });
      if (!reading) return null;
      const [bunshinProfile, recentReadings] = await Promise.all([
        tx.bunshin.findFirst({
          where: {
            id: scope.bunshinId,
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            status: 'ACTIVE',
          },
          select: {
            name: true,
            objectiveSummary: true,
            audienceSummary: true,
            personalitySummary: true,
            updatedAt: true,
          },
        }),
        tx.fortuneReading.findMany({
          where: {
            id: { not: reading.id },
            serviceSettingId: scope.id,
            participantId: reading.participantId,
            memberUserId: input.actorUserId,
            status: { in: ['READY_AI', 'READY_BASIC'] },
            deletedAt: null,
          },
          orderBy: [{ localDate: 'desc' }, { createdAt: 'desc' }],
          take: 7,
          include: {
            feedback: { select: { id: true, rating: true, issueCode: true } },
          },
        }),
      ]);
      if (!bunshinProfile) return null;
      const feedbackIds = recentReadings.flatMap((item) =>
        item.feedback ? [item.feedback.id] : [],
      );
      await tx.fortuneReading.update({
        where: { id: reading.id },
        data: {
          personalizationContext: {
            version: 'fortune-personalization-v1',
            sources: [
              'BUNSHIN_PROFILE',
              ...(recentReadings.length > 0 ? ['RECENT_READING'] : []),
              ...(feedbackIds.length > 0 ? ['READING_FEEDBACK'] : []),
            ],
            bunshin: {
              id: scope.bunshinId,
              updatedAt: bunshinProfile.updatedAt.toISOString(),
            },
            recentReadingIds: recentReadings.map((item) => item.id),
            feedbackIds,
          },
        },
      });
      return {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        bunshinId: scope.bunshinId,
        reading: await fortuneReadingView(tx, reading),
        personalization: {
          bunshinProfile: {
            name: bunshinProfile.name,
            objectiveSummary: bunshinProfile.objectiveSummary,
            audienceSummary: bunshinProfile.audienceSummary,
            personalitySummary: bunshinProfile.personalitySummary,
          },
          recentReadings: recentReadings.map((item) => ({
            id: item.id,
            localDate: item.localDate.toISOString().slice(0, 10),
            theme: item.theme,
            cardCode: item.cardCode,
            orientation: item.orientation,
            body: item.readingText,
            actionStep: item.actionStep,
            feedbackRating: item.feedback?.rating ?? null,
            feedbackIssue: (item.feedback?.issueCode as FortuneFeedbackIssue | null) ?? null,
          })),
        },
      };
    });
  }

  async completeAiGeneration(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    output: FortuneAiReadingResult;
  }): Promise<FortuneReadingView | null> {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const updated = await this.db.fortuneReading.updateMany({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
        status: 'GENERATING',
      },
      data: {
        status: 'READY_AI',
        readingText: input.output.body,
        actionStep: input.output.actionStep,
        modelName: input.output.model,
        promptVersion: input.output.promptVersion,
        failureCode: null,
        generatedAt: new Date(),
      },
    });
    if (updated.count !== 1) return null;
    const row = await this.db.fortuneReading.findFirst({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
      },
    });
    return row ? fortuneReadingView(this.db, row) : null;
  }

  async fallbackAiGeneration(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    failureCode: string;
  }): Promise<FortuneReadingView | null> {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const updated = await this.db.fortuneReading.updateMany({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
        status: 'GENERATING',
      },
      data: { status: 'READY_BASIC', failureCode: input.failureCode, modelName: null },
    });
    if (updated.count !== 1) return null;
    const row = await this.db.fortuneReading.findFirst({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
      },
    });
    return row ? fortuneReadingView(this.db, row) : null;
  }
}
