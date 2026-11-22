import { randomUUID } from 'node:crypto';
import {
  fortuneDeepReadingEnabled,
  fortuneIntakeOptions,
  fortuneIntakeQuestionKey,
  toJapanLocalDate,
  type FortuneIntakeKey,
  type FortuneTheme,
} from '@bunshin/capability-fortune';
import type { PrismaClient } from '@prisma/client';
import { fortuneReadingRetentionCutoff } from './fortune-retention';
import { fortunePurchaseScope, usesFortuneCommerce } from './fortune-commerce-entitlement';
import { dateOnly, fortuneTarget } from './fortune-shared';

type Actor = { serviceSlug: string; actorUserId: string };
const done = { kind: 'DONE' } as const;
const wait = { kind: 'WAIT' } as const;
const pendingWindowMs = 90_000;

export class PrismaFortuneIntakeRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly now = () => new Date(),
  ) {}

  private async target(input: Actor) {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope?.aiEnabled || !scope.personalProfileEnabled) return null;
    const options = fortuneIntakeOptions(scope.guidanceSettings);
    const membership = scope.group.memberships[0];
    if (!options.enabled || !membership) return null;
    const participant = await this.db.fortuneParticipant.findFirst({
      where: {
        serviceSettingId: scope.id,
        groupMembershipId: membership.id,
        userId: input.actorUserId,
      },
      select: {
        id: true,
        profileUpdatedAt: true,
        profileConsentedAt: true,
        profileInterest: true,
        profileQuestion: true,
      },
    });
    if (!participant) return null;
    if (usesFortuneCommerce(input.serviceSlug, scope)) {
      const purchase = await this.db.fortuneCommercePurchase.findFirst({
        where: {
          ...fortunePurchaseScope(scope, input.actorUserId),
          groupMembershipId: membership.id,
          status: 'PAID',
          deliveredAt: null,
        },
        select: { id: true },
      });
      if (
        !purchase ||
        !participant.profileConsentedAt ||
        !fortuneDeepReadingEnabled(scope.guidanceSettings)
      )
        return null;
    }
    const now = this.now();
    const localDate = dateOnly(toJapanLocalDate(now));
    const reading = await this.db.fortuneReading.findUnique({
      where: {
        serviceSettingId_participantId_localDate: {
          serviceSettingId: scope.id,
          participantId: participant.id,
          localDate,
        },
      },
      select: { id: true },
    });
    return reading ? null : { scope, participant, options, localDate, now };
  }

  async recordProgress(
    input: Actor & {
      questionsShown?: number;
      outcome?: 'REVIEWED' | 'SKIPPED';
      localDate?: string;
    },
  ) {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    const membership = scope?.group.memberships[0];
    if (
      !scope?.aiEnabled ||
      !scope.personalProfileEnabled ||
      !membership ||
      !fortuneDeepReadingEnabled(scope.guidanceSettings)
    )
      return;
    const participant = await this.db.fortuneParticipant.findFirst({
      where: {
        serviceSettingId: scope.id,
        groupMembershipId: membership.id,
        userId: input.actorUserId,
      },
      select: { id: true },
    });
    if (!participant) return;
    const localDate = dateOnly(input.localDate ?? toJapanLocalDate(this.now()));
    const session = { participantId: participant.id, localDate };
    const questionsShown = input.questionsShown ?? 0;
    await this.db.$transaction(async (tx) => {
      await tx.fortuneIntakeSession.createMany({
        data: { ...session, questionsShown, ...(input.outcome ? { outcome: input.outcome } : {}) },
        skipDuplicates: true,
      });
      if (questionsShown) {
        await tx.fortuneIntakeSession.updateMany({
          where: { ...session, questionsShown: { lt: questionsShown } },
          data: { questionsShown },
        });
      }
      if (input.outcome) {
        await tx.fortuneIntakeSession.updateMany({
          where: { ...session, outcome: null },
          data: { outcome: input.outcome },
        });
      }
    });
  }

  async reserve(input: Actor & { theme: FortuneTheme; answered: readonly FortuneIntakeKey[] }) {
    const target = await this.target(input);
    if (!target) return done;
    const { scope, participant, options, localDate, now } = target;
    if (input.answered.length >= Math.min(options.questions, options.calls)) return done;
    const turns = await this.db.fortuneIntakeTurn.findMany({
      where: { participantId: participant.id, localDate },
      orderBy: { step: 'asc' },
    });
    if (turns[0] && turns[0].theme !== input.theme) return done;
    const step = input.answered.length + 1;
    if (input.answered.some((key, index) => turns[index]?.questionKey !== key)) return done;
    const existing = turns[step - 1];
    if (existing) {
      if (!existing.resolvedAt)
        return now.getTime() - existing.createdAt.getTime() < pendingWindowMs ? wait : done;
      const key = fortuneIntakeQuestionKey(existing.questionKey);
      return key ? ({ kind: 'QUESTION', key } as const) : done;
    }
    const id = randomUUID();
    const created = await this.db.fortuneIntakeTurn.createMany({
      data: {
        id,
        participantId: participant.id,
        localDate,
        theme: input.theme,
        step,
        createdAt: now,
      },
      skipDuplicates: true,
    });
    if (!created.count) return wait;
    const cutoff = fortuneReadingRetentionCutoff(now, scope.historyRetentionDays);
    const profile =
      participant.profileConsentedAt &&
      participant.profileUpdatedAt &&
      participant.profileUpdatedAt >= cutoff
        ? { interest: participant.profileInterest, question: participant.profileQuestion }
        : null;
    return {
      kind: 'RESERVED',
      id,
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      bunshinId: scope.bunshinId,
      profile,
      profileRevision: participant.profileUpdatedAt,
    } as const;
  }

  async allowed(input: Actor & { id: string; profileRevision: Date | null }) {
    const target = await this.target(input);
    if (
      !target ||
      target.participant.profileUpdatedAt?.getTime() !== input.profileRevision?.getTime()
    )
      return false;
    return Boolean(
      await this.db.fortuneIntakeTurn.findFirst({
        where: {
          id: input.id,
          participantId: target.participant.id,
          localDate: target.localDate,
          resolvedAt: null,
          createdAt: { gt: new Date(target.now.getTime() - pendingWindowMs) },
          step: { lte: Math.min(target.options.calls, target.options.questions) },
        },
        select: { id: true },
      }),
    );
  }

  async finish(
    input: Actor & { id: string; profileRevision: Date | null; key: FortuneIntakeKey | null },
  ) {
    const key = input.key && (await this.allowed(input)) ? input.key : null;
    const result = await this.db.fortuneIntakeTurn.updateMany({
      where: {
        id: input.id,
        resolvedAt: null,
        participant: {
          userId: input.actorUserId,
          serviceSetting: { configuration: { slug: input.serviceSlug } },
        },
      },
      data: { questionKey: key, resolvedAt: this.now() },
    });
    return key && result.count ? ({ kind: 'QUESTION', key } as const) : done;
  }
}
