import { SelectBunshinMemories } from '@bunshin/application';
import type {
  CreateFortuneReadingResult,
  FortuneFeedbackIssue,
  FortuneOrientation,
  FortuneAiGenerationClaim,
  FortuneReadingView,
  FortuneTheme,
  FortuneRepository,
} from '@bunshin/capability-fortune';
import type { Prisma, PrismaClient } from '@prisma/client';
import { dateOnly, fortuneReadingView, fortuneTarget } from './fortune-shared';
import { lockFortuneGenerationLease } from './fortune-generation-jobs';

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

  async claimAiGeneration(
    input: Parameters<FortuneRepository['claimAiGeneration']>[0],
  ): Promise<FortuneAiGenerationClaim | null> {
    return this.db.$transaction(async (tx) => {
      const scope = await fortuneTarget(tx, input.serviceSlug, input.actorUserId);
      if (!scope || !scope.aiEnabled) return null;
      const lease = input.jobLease;
      if (
        lease &&
        (scope.id !== lease.serviceSettingId ||
          scope.workspaceId !== lease.workspaceId ||
          scope.bunshinId !== lease.bunshinId ||
          !(await lockFortuneGenerationLease(tx, lease, input.actorUserId, input.readingId)))
      )
        return null;
      const claimed = await tx.fortuneReading.updateMany({
        where: {
          id: input.readingId,
          serviceSettingId: scope.id,
          memberUserId: input.actorUserId,
          status: lease ? 'GENERATING' : 'READY_BASIC',
          ...(lease
            ? {
                workspaceId: scope.workspaceId,
                groupId: scope.groupId,
                deletedAt: null,
                participant: {
                  workspaceId: scope.workspaceId,
                  serviceSettingId: scope.id,
                  userId: input.actorUserId,
                },
              }
            : {}),
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
      const [participantProfile, recentReadings] = await Promise.all([
        tx.fortuneParticipant.findFirst({
          where: {
            id: reading.participantId,
            serviceSettingId: scope.id,
            userId: input.actorUserId,
            workspaceId: scope.workspaceId,
            personalizationBunshin: {
              is: {
                groupId: scope.groupId,
                ownerUserId: input.actorUserId,
                status: 'ACTIVE',
              },
            },
          },
          select: {
            personalizationBunshin: {
              select: {
                id: true,
                name: true,
                objectiveSummary: true,
                audienceSummary: true,
                personalitySummary: true,
                updatedAt: true,
                memories: {
                  where: { active: true, deletedAt: null },
                  orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
                  take: 10,
                },
              },
            },
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
      const bunshinProfile = participantProfile?.personalizationBunshin ?? null;
      const selectedMemories = bunshinProfile
        ? await new SelectBunshinMemories({
            list: () =>
              Promise.resolve(
                (bunshinProfile.memories ?? []).map((memory) => ({
                  ...memory,
                  confidence: memory.confidence.toNumber(),
                })),
              ),
          }).execute({
            workspaceId: scope.workspaceId,
            actorUserId: input.actorUserId,
            bunshinId: bunshinProfile.id,
            query: [
              reading.theme,
              reading.cardCode,
              reading.readingText,
              reading.actionStep,
              bunshinProfile.objectiveSummary,
              bunshinProfile.audienceSummary,
              bunshinProfile.personalitySummary,
            ]
              .filter(Boolean)
              .join('\n'),
            maxItems: 3,
            maxCharacters: 1600,
          })
        : [];
      const feedbackIds = recentReadings.flatMap((item) =>
        item.feedback ? [item.feedback.id] : [],
      );
      const contextualized = await tx.fortuneReading.update({
        where: { id: reading.id },
        data: {
          personalizationContext: {
            version: 'fortune-personalization-v2',
            sources: [
              ...(bunshinProfile ? ['PARTICIPANT_BUNSHIN_PROFILE'] : []),
              ...(selectedMemories.length > 0 ? ['PARTICIPANT_BUNSHIN_MEMORY'] : []),
              ...(recentReadings.length > 0 ? ['RECENT_READING'] : []),
              ...(feedbackIds.length > 0 ? ['READING_FEEDBACK'] : []),
            ],
            ...(bunshinProfile
              ? {
                  bunshin: {
                    id: bunshinProfile.id,
                    updatedAt: bunshinProfile.updatedAt.toISOString(),
                  },
                }
              : {}),
            recentReadingIds: recentReadings.map((item) => item.id),
            feedbackIds,
            memoryIds: selectedMemories.map((memory) => memory.id),
          },
        },
      });
      return {
        ...(lease
          ? {
              generationRevision: contextualized.updatedAt,
              jobAttempt: { jobId: lease.jobId, attemptCount: lease.attemptCount },
            }
          : {}),
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        bunshinId: scope.bunshinId,
        reading: await fortuneReadingView(tx, reading),
        personalization: {
          ...(bunshinProfile
            ? {
                bunshinProfile: {
                  name: bunshinProfile.name,
                  objectiveSummary: bunshinProfile.objectiveSummary,
                  audienceSummary: bunshinProfile.audienceSummary,
                  personalitySummary: bunshinProfile.personalitySummary,
                },
              }
            : {}),
          ...(selectedMemories.length > 0
            ? {
                memories: selectedMemories.map(({ id, type, summary, content }) => ({
                  id,
                  type,
                  summary,
                  content,
                })),
              }
            : {}),
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

  async completeAiGeneration(
    input: Parameters<FortuneRepository['completeAiGeneration']>[0],
  ): Promise<FortuneReadingView | null> {
    if (input.jobLease)
      return this.db.$transaction(async (tx) => {
        if (
          !input.generationRevision ||
          !(await lockFortuneGenerationLease(
            tx,
            input.jobLease!,
            input.actorUserId,
            input.readingId,
          ))
        )
          return null;
        return this.saveComplete(input, tx);
      });
    return this.saveComplete(input);
  }

  private async saveComplete(
    input: Parameters<FortuneRepository['completeAiGeneration']>[0],
    db: PrismaClient | Prisma.TransactionClient = this.db,
  ): Promise<FortuneReadingView | null> {
    const scope = await fortuneTarget(db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    if (
      input.jobLease &&
      (!scope.aiEnabled ||
        scope.id !== input.jobLease.serviceSettingId ||
        scope.workspaceId !== input.jobLease.workspaceId ||
        scope.bunshinId !== input.jobLease.bunshinId)
    )
      return null;
    const updated = await db.fortuneReading.updateMany({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
        status: 'GENERATING',
        ...(input.jobLease
          ? {
              updatedAt: input.generationRevision,
              workspaceId: scope.workspaceId,
              groupId: scope.groupId,
              deletedAt: null,
            }
          : {}),
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
    const row = await db.fortuneReading.findFirst({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
      },
    });
    return row ? fortuneReadingView(db, row) : null;
  }

  async fallbackAiGeneration(
    input: Parameters<FortuneRepository['fallbackAiGeneration']>[0],
  ): Promise<FortuneReadingView | null> {
    if (input.jobLease)
      return this.db.$transaction(async (tx) => {
        if (
          !input.generationRevision ||
          !(await lockFortuneGenerationLease(
            tx,
            input.jobLease!,
            input.actorUserId,
            input.readingId,
          ))
        )
          return null;
        return this.saveFallback(input, tx);
      });
    return this.saveFallback(input);
  }

  private async saveFallback(
    input: Parameters<FortuneRepository['fallbackAiGeneration']>[0],
    db: PrismaClient | Prisma.TransactionClient = this.db,
  ): Promise<FortuneReadingView | null> {
    const scope = await fortuneTarget(db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    if (
      input.jobLease &&
      (scope.id !== input.jobLease.serviceSettingId ||
        scope.workspaceId !== input.jobLease.workspaceId ||
        scope.bunshinId !== input.jobLease.bunshinId)
    )
      return null;
    const updated = await db.fortuneReading.updateMany({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
        status: 'GENERATING',
        ...(input.jobLease
          ? {
              updatedAt: input.generationRevision,
              workspaceId: scope.workspaceId,
              groupId: scope.groupId,
              deletedAt: null,
            }
          : {}),
      },
      data: { status: 'READY_BASIC', failureCode: input.failureCode, modelName: null },
    });
    if (updated.count !== 1) return null;
    const row = await db.fortuneReading.findFirst({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
      },
    });
    return row ? fortuneReadingView(db, row) : null;
  }
}
