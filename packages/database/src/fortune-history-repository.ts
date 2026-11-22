import type {
  FortuneFeedbackIssue,
  FortuneFeedbackRating,
  FortunePersonalFitRating,
  FortuneReadingView,
  FortuneReflectionAnswer,
} from '@bunshin/capability-fortune';
import { Prisma, type PrismaClient } from '@prisma/client';
import { eraseFortuneFollowUps } from './fortune-follow-ups';
import { fortuneReadingRetentionCutoff } from './fortune-retention';
import { fortuneReadingView, fortuneTarget } from './fortune-shared';

export class PrismaFortuneHistoryRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listReadings(input: {
    serviceSlug: string;
    actorUserId: string;
    limit: number;
  }): Promise<FortuneReadingView[] | null> {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const participant = await this.db.fortuneParticipant.findFirst({
      where: { serviceSettingId: scope.id, userId: input.actorUserId },
    });
    if (!participant) return null;
    const cutoff = fortuneReadingRetentionCutoff(this.now(), scope.historyRetentionDays);
    const rows = await this.db.fortuneReading.findMany({
      where: {
        serviceSettingId: scope.id,
        participantId: participant.id,
        memberUserId: input.actorUserId,
        status: { not: 'DELETED' },
        localDate: { gte: cutoff },
      },
      orderBy: [{ localDate: 'desc' }, { createdAt: 'desc' }],
      take: input.limit,
    });
    return Promise.all(rows.map((row) => fortuneReadingView(this.db, row)));
  }

  async findReading(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
  }): Promise<FortuneReadingView | null> {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const cutoff = fortuneReadingRetentionCutoff(this.now(), scope.historyRetentionDays);
    const row = await this.db.fortuneReading.findFirst({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
        status: { not: 'DELETED' },
        localDate: { gte: cutoff },
      },
    });
    return row ? fortuneReadingView(this.db, row) : null;
  }

  async markReadingViewed(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    viewedAt: Date;
  }): Promise<FortuneReadingView | null> {
    return this.db.$transaction(async (tx) => {
      const scope = await fortuneTarget(tx, input.serviceSlug, input.actorUserId);
      if (!scope) return null;
      const cutoff = fortuneReadingRetentionCutoff(input.viewedAt, scope.historyRetentionDays);
      const viewed = await tx.fortuneReading.updateMany({
        where: {
          id: input.readingId,
          serviceSettingId: scope.id,
          memberUserId: input.actorUserId,
          status: { in: ['READY_AI', 'READY_BASIC'] },
          localDate: { gte: cutoff },
          firstViewedAt: null,
        },
        data: { firstViewedAt: input.viewedAt },
      });
      const row = await tx.fortuneReading.findFirst({
        where: {
          id: input.readingId,
          serviceSettingId: scope.id,
          memberUserId: input.actorUserId,
          status: { in: ['READY_AI', 'READY_BASIC'] },
          localDate: { gte: cutoff },
        },
      });
      if (viewed.count === 1 && row && row.deepReading === null) {
        const paid = await tx.fortuneCommercePurchase.findFirst({
          where: {
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            serviceSettingId: scope.id,
            readingId: row.id,
          },
          select: { id: true },
        });
        if (!paid)
          await tx.fortuneReading.update({
            where: { id: row.id },
            data: { freeFirstViewedAt: input.viewedAt },
          });
      }
      return row ? fortuneReadingView(tx, row) : null;
    });
  }

  async submitFeedback(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    rating: FortuneFeedbackRating;
    issue: FortuneFeedbackIssue | null;
    submittedAt: Date;
  }): Promise<FortuneReadingView | null> {
    return this.db.$transaction(async (tx) => {
      const scope = await fortuneTarget(tx, input.serviceSlug, input.actorUserId);
      if (!scope) return null;
      const cutoff = fortuneReadingRetentionCutoff(input.submittedAt, scope.historyRetentionDays);
      const reading = await tx.fortuneReading.findFirst({
        where: {
          id: input.readingId,
          serviceSettingId: scope.id,
          memberUserId: input.actorUserId,
          status: { in: ['READY_AI', 'READY_BASIC'] },
          localDate: { gte: cutoff },
          firstViewedAt: { not: null },
        },
      });
      if (!reading) return null;
      await tx.fortuneFeedback.upsert({
        where: { readingId: reading.id },
        create: {
          workspaceId: reading.workspaceId,
          groupId: reading.groupId,
          serviceSettingId: reading.serviceSettingId,
          participantId: reading.participantId,
          memberUserId: reading.memberUserId,
          readingId: reading.id,
          rating: input.rating,
          issueCode: input.issue,
          createdAt: input.submittedAt,
        },
        update: { rating: input.rating, issueCode: input.issue },
      });
      return fortuneReadingView(tx, reading);
    });
  }

  async saveReflection(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    answer: FortuneReflectionAnswer | null;
  }) {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope || (input.answer && !scope.reflectionEnabled)) return false;
    const cutoff = fortuneReadingRetentionCutoff(this.now(), scope.historyRetentionDays);
    const result = await this.db.fortuneReading.updateMany({
      where: {
        id: input.readingId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
        status: { in: ['READY_AI', 'READY_BASIC'] },
        deletedAt: null,
        localDate: { gte: cutoff },
        participant: {
          userId: input.actorUserId,
          groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
          ...(input.answer
            ? { profileUpdatedAt: { gte: cutoff }, profileConsentedAt: { not: null } }
            : {}),
        },
        ...(input.answer
          ? { serviceSetting: { reflectionEnabled: true, personalProfileEnabled: true } }
          : {}),
      },
      data: { reflectionAnswer: input.answer },
    });
    return result.count === 1;
  }

  async savePersonalFit(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    rating: FortunePersonalFitRating | null;
  }) {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return false;
    const now = this.now();
    const result = await this.db.fortuneReading.updateMany({
      where: {
        id: input.readingId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
        status: 'READY_AI',
        deletedAt: null,
        localDate: { gte: fortuneReadingRetentionCutoff(now, scope.historyRetentionDays) },
        firstViewedAt: { not: null },
        participant: { groupMembership: { status: 'ACTIVE', consentedAt: { not: null } } },
        ...(input.rating
          ? { serviceSetting: { enabled: true, aiEnabled: true, personalProfileEnabled: true } }
          : {}),
      },
      data: { personalFitRating: input.rating, personalFitRatedAt: input.rating ? now : null },
    });
    return result.count === 1;
  }

  async deleteReading(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    deletedAt: Date;
  }): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const scope = await fortuneTarget(tx, input.serviceSlug, input.actorUserId);
      if (!scope) return false;
      const result = await tx.fortuneReading.updateMany({
        where: {
          id: input.readingId,
          serviceSettingId: scope.id,
          memberUserId: input.actorUserId,
          status: { not: 'DELETED' },
        },
        data: {
          status: 'DELETED',
          readingText: null,
          actionStep: null,
          pendingConsultation: null,
          pendingUnderstanding: Prisma.DbNull,
          deepReading: Prisma.DbNull,
          reflectionPrompt: null,
          reflectionAnswer: null,
          personalFitRating: null,
          personalFitRatedAt: null,
          modelName: null,
          failureCode: null,
          deletedAt: input.deletedAt,
        },
      });
      if (result.count === 1) {
        await eraseFortuneFollowUps(tx, {
          id: input.readingId,
          serviceSettingId: scope.id,
          memberUserId: input.actorUserId,
        });
      }
      return result.count === 1;
    });
  }
}
