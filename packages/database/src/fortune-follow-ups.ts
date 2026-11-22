import { ApplicationError } from '@bunshin/shared';
import { fortunePurchaseScope, usesFortuneCommerce } from './fortune-commerce-entitlement';
import { Prisma, type PrismaClient } from '@prisma/client';
import { FORTUNE_PROFILE_STYLES, type FortuneReadingOutput } from '@bunshin/capability-fortune';
import {
  FORTUNE_FOLLOW_UP_CREDIT_NAME,
  fortuneFollowUpReservationCutoff,
  lockFortuneCreditAccount,
  readFortuneFollowUpCreditBalance,
  settleFortuneFollowUpCredits,
} from './fortune-follow-up-credits';
import { fortuneReadingRetentionCutoff } from './fortune-retention';
import { fortuneReadingView, fortuneTarget } from './fortune-shared';

type Scope = { serviceSlug: string; actorUserId: string; readingId: string };
type Db = PrismaClient | Prisma.TransactionClient;

async function eligible(db: Db, input: Scope, now: Date) {
  const scope = await fortuneTarget(db, input.serviceSlug, input.actorUserId);
  if (!scope?.aiEnabled || !scope.personalProfileEnabled) return null;
  const cutoff = fortuneReadingRetentionCutoff(now, scope.historyRetentionDays);
  const reading = await db.fortuneReading.findFirst({
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
        profileConsentedAt: { not: null },
        profileUpdatedAt: { gte: cutoff },
        groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
      },
    },
    include: {
      participant: {
        select: { profileUpdatedAt: true, profileStyle: true, groupMembershipId: true },
      },
      followUps: { orderBy: { turn: 'asc' } },
    },
  });
  if (!reading?.participant.profileUpdatedAt) return null;
  if (usesFortuneCommerce(input.serviceSlug, scope)) {
    const purchase = await db.fortuneCommercePurchase.findFirst({
      where: {
        ...fortunePurchaseScope(scope, input.actorUserId),
        readingId: reading.id,
      },
      select: { id: true, followUpLimit: true, status: true, deliveredAt: true },
    });
    const delivered = purchase?.status === 'PAID' && purchase.deliveredAt !== null;
    if ((purchase || reading.deepReading !== null) && !delivered) return null;
    if (
      !delivered &&
      !scope.followUpCreditEnabled &&
      !reading.followUps.some((turn) => turn.creditCost !== null)
    )
      return null;
    return {
      scope,
      reading,
      revision: reading.participant.profileUpdatedAt,
      limit: delivered ? purchase.followUpLimit : 0,
      purchaseId: delivered ? purchase.id : null,
    };
  }
  const settings = scope.guidanceSettings;
  const configured =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings.followUpLimit
      : undefined;
  const limit = configured === 0 || configured === 1 ? configured : 2;
  return {
    scope,
    reading,
    revision: reading.participant.profileUpdatedAt,
    limit,
    purchaseId: null,
  };
}

type Eligible = NonNullable<Awaited<ReturnType<typeof eligible>>>;

function remainingIncluded(record: Eligible) {
  return Math.max(
    0,
    record.limit - record.reading.followUps.filter((turn) => turn.creditCost === null).length,
  );
}

function active(turn: { status: string; createdAt: Date }, now: Date) {
  return turn.status === 'PENDING' && turn.createdAt > fortuneFollowUpReservationCutoff(now);
}

function remainingExchanges(record: Eligible, now: Date, completedExchanges: number) {
  const held = record.reading.followUps.filter(
    (turn) => turn.creditCost !== null && active(turn, now),
  ).length;
  return Math.max(0, record.scope.followUpCreditLimit - completedExchanges - held);
}

function creditScope({ scope, reading }: Eligible) {
  return {
    workspaceId: scope.workspaceId,
    groupId: scope.groupId,
    groupMembershipId: reading.participant.groupMembershipId,
    userId: reading.memberUserId,
  };
}

async function view(db: Db, record: Eligible, now: Date) {
  const remaining = remainingIncluded(record);
  const { followUpCreditEnabled, followUpCreditCost, creditDisplayName } = record.scope;
  const balance =
    remaining === 0 && followUpCreditEnabled
      ? await readFortuneFollowUpCreditBalance(db, creditScope(record), now, {
          readingId: record.reading.id,
        })
      : null;
  return {
    remaining,
    ...(balance
      ? {
          creditOffer: {
            cost: followUpCreditCost,
            name: creditDisplayName ?? FORTUNE_FOLLOW_UP_CREDIT_NAME,
            available: balance.available,
            remaining: remainingExchanges(record, now, balance.completedExchanges),
          },
        }
      : {}),
    turns: record.reading.followUps.flatMap(
      ({ status, turn, question, answer, actionStep, createdAt, creditCost }) =>
        status === 'ERASED' || question === null
          ? []
          : [
              {
                turn,
                question,
                status:
                  status === 'READY'
                    ? ('READY' as const)
                    : active({ status, createdAt }, now)
                      ? ('PENDING' as const)
                      : ('FAILED' as const),
                answer,
                actionStep,
                ...(creditCost === null ? {} : { creditCost }),
              },
            ],
    ),
  };
}

async function lockPurchase(db: Prisma.TransactionClient, record: Eligible) {
  if (record.purchaseId)
    await db.$queryRaw`SELECT id FROM fortune_commerce_purchases
      WHERE id=${record.purchaseId}::uuid AND workspace_id=${record.scope.workspaceId}::uuid
        AND group_id=${record.scope.groupId}::uuid FOR UPDATE`;
}

async function releaseExchange(tx: Prisma.TransactionClient, input: Scope & { requestId: string }) {
  await tx.fortuneReadingFollowUp.updateMany({
    where: {
      id: input.requestId,
      readingId: input.readingId,
      status: 'PENDING',
      creditCost: { not: null },
      reading: {
        memberUserId: input.actorUserId,
        serviceSetting: { configuration: { slug: input.serviceSlug } },
      },
    },
    data: { status: 'FAILED' },
  });
}

async function lockReading(db: Prisma.TransactionClient, record: Eligible) {
  await db.$queryRaw(
    Prisma.sql`SELECT id FROM fortune_participants WHERE id = ${record.reading.participantId}::uuid FOR UPDATE`,
  );
  await db.$queryRaw(
    Prisma.sql`SELECT id FROM fortune_readings WHERE id = ${record.reading.id}::uuid FOR UPDATE`,
  );
}

export class PrismaFortuneFollowUpRepository {
  constructor(private readonly db: PrismaClient) {}

  async read(input: Scope) {
    const now = new Date();
    const record = await eligible(this.db, input, now);
    return record ? view(this.db, record, now) : null;
  }

  async reserve(
    input: Scope & { requestId: string; question: string; expectedCreditCost?: number },
  ) {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const initial = await eligible(tx, input, now);
      if (!initial) return { kind: 'UNAVAILABLE' } as const;
      await lockReading(tx, initial);
      const record = await eligible(tx, input, now);
      if (!record) return { kind: 'UNAVAILABLE' } as const;
      const { scope, reading, revision } = record;
      const creditCost = input.expectedCreditCost ?? null;
      const previous = reading.followUps.find((turn) => turn.id === input.requestId);
      if (previous) {
        if (
          previous.creditCost !== creditCost ||
          (previous.question !== null && previous.question !== input.question)
        )
          return { kind: 'REQUEST_CONFLICT' } as const;
        return { kind: 'REPLAY', view: await view(tx, record, now) } as const;
      }
      const included = remainingIncluded(record);
      if (creditCost === null) {
        if (included === 0) return { kind: 'LIMIT' } as const;
      } else {
        if (included > 0 || !scope.followUpCreditEnabled || creditCost !== scope.followUpCreditCost)
          return { kind: 'OFFER_CHANGED' } as const;
        if (reading.followUps.some((turn) => active(turn, now))) return { kind: 'LIMIT' } as const;
        const accountScope = creditScope(record);
        await lockFortuneCreditAccount(tx, accountScope);
        const checkedAt = new Date();
        const balance = await readFortuneFollowUpCreditBalance(tx, accountScope, checkedAt, {
          readingId: reading.id,
        });
        if (remainingExchanges(record, checkedAt, balance.completedExchanges) === 0)
          return { kind: 'LIMIT' } as const;
        if (balance.available < creditCost) return { kind: 'INSUFFICIENT_CREDIT' } as const;
      }
      const style = FORTUNE_PROFILE_STYLES.find(
        (value) => value === reading.participant.profileStyle,
      );
      await tx.fortuneReadingFollowUp.create({
        data: {
          id: input.requestId,
          readingId: reading.id,
          turn: (reading.followUps.at(-1)?.turn ?? 0) + 1,
          creditCost,
          question: input.question,
          status: 'PENDING',
        },
      });
      return {
        kind: 'RESERVED',
        claim: {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          bunshinId: scope.bunshinId,
          reading: await fortuneReadingView(tx, reading),
          personalProfileRevision: revision,
          personalGuidance: true,
          ...(record.purchaseId ? { purchaseId: record.purchaseId } : {}),
          guidanceSettings: scope.guidanceSettings,
          ...(style ? { defaultStyle: style } : {}),
        },
        prior: reading.followUps.flatMap(({ status, question, answer }) =>
          status === 'READY' && question && answer ? [{ question, answer }] : [],
        ),
      } as const;
    });
  }

  async allowed(input: Scope & { requestId: string; revision: Date }) {
    const now = new Date();
    const record = await eligible(this.db, input, now);
    const turn = record?.reading.followUps.find((item) => item.id === input.requestId);
    if (record?.revision.getTime() !== input.revision.getTime() || turn?.status !== 'PENDING')
      return false;
    if (turn.creditCost !== null) return active(turn, now);
    return (
      record.reading.followUps.filter((item) => item.creditCost === null && item.turn <= turn.turn)
        .length <= record.limit
    );
  }

  async complete(
    input: Scope & { requestId: string; revision: Date; output: FortuneReadingOutput | null },
  ) {
    return this.db.$transaction(async (tx) => {
      const initial = await eligible(tx, input, new Date());
      if (!initial) {
        await releaseExchange(tx, input);
        return null;
      }
      await lockReading(tx, initial);
      // A webhook revoking a purchase uses the same purchase lock before touching credits.
      await lockPurchase(tx, initial);
      const now = new Date();
      const record = await eligible(tx, input, now);
      if (!record || record.revision.getTime() !== input.revision.getTime()) {
        await releaseExchange(tx, input);
        return null;
      }
      const turn = record.reading.followUps.find((item) => item.id === input.requestId);
      if (!turn || turn.status !== 'PENDING') return view(tx, record, now);
      let output = input.output;
      if (turn.creditCost !== null && output) {
        const accountScope = creditScope(record);
        await lockFortuneCreditAccount(tx, accountScope);
        const settledAt = new Date();
        if (
          !active(turn, settledAt) ||
          !(await settleFortuneFollowUpCredits(
            tx,
            accountScope,
            {
              readingId: input.readingId,
              requestId: input.requestId,
              creditCost: turn.creditCost,
            },
            settledAt,
          ))
        )
          output = null;
      }
      const changed = await tx.fortuneReadingFollowUp.updateMany({
        where: { id: input.requestId, readingId: input.readingId, status: 'PENDING' },
        data: output
          ? { status: 'READY', answer: output.body, actionStep: output.actionStep }
          : { status: 'FAILED' },
      });
      if (changed.count !== 1)
        throw new ApplicationError('CONFLICT', '追加質問の状態が変わりました。');
      const completed = await eligible(tx, input, now);
      return completed ? view(tx, completed, now) : null;
    });
  }
}

export async function eraseFortuneFollowUps(
  db: Prisma.TransactionClient,
  where: Prisma.FortuneReadingWhereInput,
) {
  await db.fortuneReadingFollowUp.updateMany({
    where: { status: { not: 'ERASED' }, reading: where },
    data: { status: 'ERASED', question: null, answer: null, actionStep: null },
  });
}
