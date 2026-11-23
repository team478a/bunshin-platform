import { ApplicationError } from '@bunshin/shared';
import {
  fortunePurchaseScope,
  reserveFortunePurchase,
  usesFortuneCommerce,
} from './fortune-commerce-entitlement';
import { SelectBunshinMemories } from '@bunshin/application';
import {
  buildFortuneDeepReadingDetails,
  toJapanLocalDate,
  fortuneDeepReadingEnabled,
  parseFortuneReviewedItems,
  FORTUNE_PROFILE_STYLES,
  FORTUNE_REFLECTION_ANSWERS,
  fortuneDrawPool,
} from '@bunshin/capability-fortune';
import type {
  CreateFortuneReadingResult,
  FortuneFeedbackIssue,
  FortuneAiGenerationClaim,
  FortuneReadingView,
  FortuneRepository,
} from '@bunshin/capability-fortune';
import { Prisma, type PrismaClient } from '@prisma/client';
import { dateOnly, fortuneReadingView, fortuneTarget } from './fortune-shared';
import { lockFortuneGenerationLease } from './fortune-generation-jobs';
import { PrismaFortuneUnderstandingRepository } from './fortune-understanding';
import { PrismaFortunePersonalProfileRepository } from './fortune-personal-profile';
import { fortuneReadingRetentionCutoff } from './fortune-retention';

export class PrismaFortuneGenerationRepository {
  constructor(private readonly db: PrismaClient) {}

  async findDrawDeck(input: Parameters<NonNullable<FortuneRepository['findDrawDeck']>>[0]) {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const version = await this.db.fortuneKnowledgeVersion.findFirst({
      where: { serviceSettingId: scope.id, status: 'APPROVED' },
      orderBy: { version: 'desc' },
      select: { id: true, deck: true },
    });
    return version ? { knowledgeVersionId: version.id, pool: fortuneDrawPool(version.deck) } : null;
  }

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

  async createBasicReading(
    input: Parameters<FortuneRepository['createBasicReading']>[0],
  ): Promise<CreateFortuneReadingResult> {
    return this.db.$transaction(async (tx) => {
      const scope = await fortuneTarget(tx, input.serviceSlug, input.actorUserId);
      if (!scope) return { kind: 'NOT_AVAILABLE' };
      const participant = await tx.fortuneParticipant.findFirst({
        where: { serviceSettingId: scope.id, userId: input.actorUserId },
      });
      if (!participant) return { kind: 'NOT_PARTICIPANT' };
      const commerce = usesFortuneCommerce(input.serviceSlug, scope);
      const paidRequest = input.paidReading === true;
      if (
        (paidRequest && !commerce) ||
        (commerce && !paidRequest && input.reviewedUnderstanding?.length)
      )
        throw new ApplicationError('FORBIDDEN', '深層鑑定は購入画面からご利用ください。');
      if (paidRequest) {
        if (
          !scope.personalProfileEnabled ||
          !scope.aiEnabled ||
          !fortuneDeepReadingEnabled(scope.guidanceSettings) ||
          !participant.profileConsentedAt
        )
          throw new ApplicationError('FORBIDDEN', '深層鑑定には個別化への同意が必要です。');
        await tx.$queryRaw`SELECT id FROM fortune_participants
          WHERE id = ${participant.id}::uuid AND service_setting_id = ${scope.id}::uuid
            AND profile_consented_at IS NOT NULL FOR UPDATE`.then((rows) => {
          if (!Array.isArray(rows) || rows.length !== 1)
            throw new ApplicationError('FORBIDDEN', '個別化設定をご確認ください。');
        });
      }
      const knowledge = await tx.fortuneKnowledgeVersion.findFirst({
        where: {
          serviceSettingId: scope.id,
          ...(input.knowledgeVersionId
            ? { id: input.knowledgeVersionId, status: { in: ['APPROVED', 'RETIRED'] } }
            : { status: 'APPROVED' }),
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
      const reviewed =
        scope.personalProfileEnabled &&
        scope.aiEnabled &&
        fortuneDeepReadingEnabled(scope.guidanceSettings)
          ? parseFortuneReviewedItems(input.reviewedUnderstanding)
          : null;
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
          ...(!commerce && reviewed ? { pendingUnderstanding: reviewed } : {}),
          ...(!commerce &&
          !reviewed &&
          scope.personalProfileEnabled &&
          scope.aiEnabled &&
          input.consultation
            ? { pendingConsultation: input.consultation }
            : {}),
          promptVersion: knowledge.promptVersion,
          generatedAt: new Date(),
        },
      });
      if (paidRequest && !reviewed)
        throw new ApplicationError(
          'VALIDATION_ERROR',
          '深層鑑定に使う相談内容を確認してください。',
        );
      if (paidRequest && reviewed) {
        if (reading.status === 'DELETED')
          throw new ApplicationError(
            'CONFLICT',
            '今日の結果は削除済みです。明日以降にご利用ください。',
          );
        if (
          !reading.deepReading &&
          reading.status !== 'GENERATING' &&
          !reading.pendingUnderstanding
        ) {
          await reserveFortunePurchase(tx, {
            ...fortunePurchaseScope(scope, input.actorUserId),
            readingId: reading.id,
            membershipId: participant.groupMembershipId,
          });
          const basic =
            reading.knowledgeVersionId === knowledge.id &&
            reading.cardCode === input.cardCode &&
            reading.orientation === input.orientation &&
            reading.theme === input.theme
              ? meaning
              : await tx.fortuneCardMeaning.findFirst({
                  where: {
                    knowledgeVersionId: reading.knowledgeVersionId ?? knowledge.id,
                    cardCode: reading.cardCode,
                    orientation: reading.orientation,
                    theme: reading.theme,
                    safetyReviewed: true,
                  },
                });
          if (!basic)
            throw new ApplicationError('CONFLICT', '今日のカードの基本解釈を確認できません。');
          const staged = await tx.fortuneReading.update({
            where: { id: reading.id },
            data: {
              status: 'READY_BASIC',
              readingText: basic.body,
              actionStep: basic.actionStep,
              reflectionPrompt: null,
              pendingConsultation: null,
              pendingUnderstanding: reviewed,
              failureCode: null,
            },
          });
          return { kind: 'READY', reading: await fortuneReadingView(tx, staged) };
        }
      }
      if (scope.personalProfileEnabled && !participant.profileUpdatedAt) {
        // Drawing directly is also a valid way to finish the optional intake.
        await tx.fortuneParticipant.updateMany({
          where: {
            id: participant.id,
            serviceSettingId: scope.id,
            userId: input.actorUserId,
            profileUpdatedAt: null,
          },
          data: { profileUpdatedAt: new Date() },
        });
      }
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
      const commerce = usesFortuneCommerce(input.serviceSlug, scope);
      if (commerce && !lease) {
        const staged = await tx.fortuneReading.findFirst({
          where: {
            id: input.readingId,
            serviceSettingId: scope.id,
            memberUserId: input.actorUserId,
            pendingUnderstanding: { not: Prisma.DbNull },
            status: 'READY_BASIC',
          },
          select: { id: true },
        });
        if (!staged) return null;
      }
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
      let purchaseId: string | undefined;
      if (commerce) {
        const entitlement =
          reading.pendingUnderstanding &&
          (await tx.fortuneCommercePurchase.findFirst({
            where: {
              ...fortunePurchaseScope(scope, input.actorUserId),
              readingId: reading.id,
              status: 'PAID',
              deliveredAt: null,
            },
            select: { id: true },
          }));
        if (!entitlement) {
          await this.saveFallback({ ...input, failureCode: 'FORTUNE_PURCHASE_REQUIRED' }, tx);
          return null;
        }
        purchaseId = entitlement.id;
      }
      const personal = await new PrismaFortunePersonalProfileRepository(tx).read(input);
      const reviewed =
        personal?.enabled && fortuneDeepReadingEnabled(scope.guidanceSettings)
          ? parseFortuneReviewedItems(reading.pendingUnderstanding)
          : null;
      const personalProfileRevision = personal?.enabled ? personal.revision : null;
      const saved =
        reviewed && personalProfileRevision
          ? await new PrismaFortuneUnderstandingRepository(tx).read(input, true)
          : null;
      const priorItems =
        saved?.canSave &&
        saved.savedAt &&
        saved.revision &&
        dateOnly(toJapanLocalDate(new Date(saved.savedAt))) < reading.localDate
          ? saved.items.filter(({ field }) => !reviewed?.some((item) => item.field === field))
          : [];
      const priorUnderstanding =
        saved?.savedAt && saved.revision && priorItems.length
          ? { savedAt: saved.savedAt, items: priorItems, revision: saved.revision }
          : null;
      const useSelectedBunshin = personal?.enabled
        ? Boolean(personalProfileRevision)
        : !personal?.completed;
      const [participantProfile, recentReadings] = await Promise.all([
        useSelectedBunshin
          ? tx.fortuneParticipant.findFirst({
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
            })
          : null,
        personalProfileRevision
          ? tx.fortuneReading.findMany({
              where: {
                id: { not: reading.id },
                workspaceId: scope.workspaceId,
                groupId: scope.groupId,
                serviceSettingId: scope.id,
                participantId: reading.participantId,
                memberUserId: input.actorUserId,
                theme: reading.theme,
                status: { in: ['READY_AI', 'READY_BASIC'] },
                deletedAt: null,
                localDate: {
                  lt: reading.localDate,
                  gte: fortuneReadingRetentionCutoff(new Date(), scope.historyRetentionDays),
                },
              },
              orderBy: [{ localDate: 'desc' }, { createdAt: 'desc' }],
              take: 7,
              include: {
                feedback: { select: { id: true, rating: true, issueCode: true } },
              },
            })
          : [],
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
              personal?.enabled ? reading.pendingConsultation : null,
              reading.theme,
              reading.cardCode,
              reading.readingText,
              reading.actionStep,
              personalProfileRevision ? personal?.profile.interest : null,
              personalProfileRevision ? personal?.profile.question : null,
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
            version: personal?.enabled
              ? 'fortune-personalization-v3'
              : 'fortune-personalization-v2',
            ...(personalProfileRevision
              ? { participantProfileUpdatedAt: personalProfileRevision.toISOString() }
              : {}),
            sources: [
              ...(personalProfileRevision ? ['PARTICIPANT_FORTUNE_PROFILE'] : []),
              ...(personal?.enabled && (reading.pendingConsultation || reviewed)
                ? ['CURRENT_CONSULTATION']
                : []),
              ...(priorUnderstanding ? ['SAVED_FORTUNE_UNDERSTANDING'] : []),
              ...(bunshinProfile ? ['PARTICIPANT_BUNSHIN_PROFILE'] : []),
              ...(selectedMemories.length > 0 ? ['PARTICIPANT_BUNSHIN_MEMORY'] : []),
              ...(recentReadings.length > 0 ? ['RECENT_READING'] : []),
              ...(feedbackIds.length > 0 ? ['READING_FEEDBACK'] : []),
              ...(personalProfileRevision &&
              scope.reflectionEnabled &&
              recentReadings.some((item) => item.reflectionAnswer)
                ? ['READING_REFLECTION']
                : []),
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
      const settings = scope.guidanceSettings;
      const defaultStyle =
        settings && typeof settings === 'object' && !Array.isArray(settings)
          ? FORTUNE_PROFILE_STYLES.find((style) => settings['defaultStyle'] === style)
          : undefined;
      return {
        ...(personal?.enabled && settings ? { guidanceSettings: settings } : {}),
        ...(personal?.enabled && defaultStyle ? { defaultStyle } : {}),
        ...(lease
          ? {
              generationRevision: contextualized.updatedAt,
              jobAttempt: { jobId: lease.jobId, attemptCount: lease.attemptCount },
            }
          : commerce
            ? { generationRevision: contextualized.updatedAt }
            : {}),
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        bunshinId: scope.bunshinId,
        reading: await fortuneReadingView(tx, reading),
        ...(purchaseId ? { purchaseId } : {}),
        ...(personal?.enabled ? { personalGuidance: true } : {}),
        ...(personal?.enabled && scope.reflectionEnabled ? { reflectionEnabled: true } : {}),
        ...(personal?.enabled && reading.pendingConsultation
          ? { consultation: reading.pendingConsultation }
          : {}),
        ...(reviewed ? { reviewedUnderstanding: reviewed } : {}),
        ...(personal?.profile && personalProfileRevision ? { personalProfileRevision } : {}),
        ...(priorUnderstanding ? { priorUnderstandingRevision: priorUnderstanding.revision } : {}),
        personalization: {
          ...(priorUnderstanding
            ? {
                priorUnderstanding: {
                  savedAt: priorUnderstanding.savedAt,
                  items: priorUnderstanding.items,
                },
              }
            : {}),
          ...(personal?.profile && personalProfileRevision
            ? {
                participantProfile: {
                  interest: personal.profile.interest,
                  question: personal.profile.question,
                  style: personal.profile.style,
                },
              }
            : {}),
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
            ...(personalProfileRevision && scope.reflectionEnabled && item.reflectionAnswer
              ? {
                  reflectionAnswer: FORTUNE_REFLECTION_ANSWERS.find(
                    (answer) => answer === item.reflectionAnswer,
                  )!,
                }
              : {}),
            id: item.id,
            localDate: item.localDate.toISOString().slice(0, 10),
            theme: item.theme,
            cardCode: item.cardCode,
            orientation: item.orientation,
            body: item.deepReading ? null : item.readingText,
            actionStep: item.deepReading ? null : item.actionStep,
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
    return input.generationRevision
      ? this.db.$transaction((tx) => this.saveComplete(input, tx))
      : this.saveComplete(input);
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
    const commerce = usesFortuneCommerce(input.serviceSlug, scope);
    if (commerce && (!input.output.deep || !input.generationRevision))
      return this.saveFallback({ ...input, failureCode: 'FORTUNE_DEEP_CONTEXT_CHANGED' }, db);
    if (commerce) {
      const reserved = await db.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM fortune_commerce_purchases
        WHERE workspace_id = ${scope.workspaceId}::uuid AND group_id = ${scope.groupId}::uuid
          AND service_setting_id = ${scope.id}::uuid AND buyer_user_id = ${input.actorUserId}::uuid
          AND reading_id = ${input.readingId}::uuid AND status = 'PAID' AND delivered_at IS NULL
        FOR UPDATE`;
      if (!reserved.length)
        return this.saveFallback({ ...input, failureCode: 'FORTUNE_PURCHASE_REQUIRED' }, db);
    }
    const deepProposal = input.output.deep;
    const pending =
      deepProposal &&
      (await db.fortuneReading.findFirst({
        where: { id: input.readingId, serviceSettingId: scope.id, memberUserId: input.actorUserId },
        select: { pendingUnderstanding: true },
      }));
    const reviewed =
      deepProposal &&
      scope.aiEnabled &&
      scope.personalProfileEnabled &&
      fortuneDeepReadingEnabled(scope.guidanceSettings) &&
      pending
        ? parseFortuneReviewedItems(pending.pendingUnderstanding)
        : null;
    if (deepProposal && !reviewed)
      return this.saveFallback({ ...input, failureCode: 'FORTUNE_DEEP_CONTEXT_CHANGED' }, db);
    const updated = await db.fortuneReading.updateMany({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
        status: 'GENERATING',
        ...(reviewed ? { pendingUnderstanding: { equals: reviewed } } : {}),
        ...(input.generationRevision
          ? {
              updatedAt: input.generationRevision,
              workspaceId: scope.workspaceId,
              groupId: scope.groupId,
              deletedAt: null,
            }
          : {}),
        ...(input.personalProfileRevision
          ? {
              participant: {
                profileConsentedAt: { not: null },
                ...(input.priorUnderstandingRevision
                  ? {
                      understandingRevision: input.priorUnderstandingRevision,
                      understandingExpiresAt: { gt: new Date() },
                    }
                  : {}),
                profileUpdatedAt: {
                  equals: input.personalProfileRevision,
                  gte: fortuneReadingRetentionCutoff(new Date(), scope.historyRetentionDays),
                },
                groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
              },
            }
          : {}),
        ...(reviewed
          ? {
              serviceSetting: {
                aiEnabled: true,
                personalProfileEnabled: true,
                AND: [
                  { guidanceSettings: { path: ['intake', 'enabled'], equals: true } },
                  { guidanceSettings: { path: ['deepReadingEnabled'], equals: true } },
                ],
              },
            }
          : input.personalProfileRevision
            ? { serviceSetting: { personalProfileEnabled: true } }
            : {}),
      },
      data: {
        status: 'READY_AI',
        pendingConsultation: null,
        pendingUnderstanding: Prisma.DbNull,
        ...(deepProposal && reviewed
          ? { deepReading: buildFortuneDeepReadingDetails(reviewed, deepProposal) }
          : {}),
        readingText: input.output.body,
        ...(scope.reflectionEnabled && input.output.reflectionPrompt
          ? { reflectionPrompt: input.output.reflectionPrompt }
          : {}),
        actionStep: input.output.actionStep,
        modelName: input.output.model,
        promptVersion: input.output.promptVersion,
        failureCode: null,
        generatedAt: new Date(),
      },
    });
    if (updated.count !== 1)
      return input.personalProfileRevision || deepProposal
        ? this.saveFallback(
            {
              ...input,
              failureCode: reviewed ? 'FORTUNE_DEEP_CONTEXT_CHANGED' : 'FORTUNE_PROFILE_CHANGED',
            },
            db,
          )
        : null;
    if (commerce) {
      const delivered = await db.fortuneCommercePurchase.updateMany({
        where: {
          ...fortunePurchaseScope(scope, input.actorUserId),
          readingId: input.readingId,
          status: 'PAID',
          deliveredAt: null,
        },
        data: { deliveredAt: new Date() },
      });
      if (delivered.count !== 1)
        throw new ApplicationError('CONFLICT', '鑑定の購入状況が変更されました。');
    }
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
        ...(input.generationRevision
          ? {
              updatedAt: input.generationRevision,
              workspaceId: scope.workspaceId,
              groupId: scope.groupId,
              deletedAt: null,
            }
          : {}),
      },
      data: {
        status: 'READY_BASIC',
        failureCode: input.failureCode,
        modelName: null,
        pendingConsultation: null,
        pendingUnderstanding: Prisma.DbNull,
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
}
