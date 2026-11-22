import { fortunePurchaseScope, usesFortuneCommerce } from './fortune-commerce-entitlement';
import { Prisma, type PrismaClient } from '@prisma/client';
import { FORTUNE_PROFILE_STYLES, type FortuneReadingOutput } from '@bunshin/capability-fortune';
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
      participant: { select: { profileUpdatedAt: true, profileStyle: true } },
      followUps: { orderBy: { turn: 'asc' } },
    },
  });
  if (!reading?.participant.profileUpdatedAt) return null;
  if (usesFortuneCommerce(input.serviceSlug, scope)) {
    const purchase = await db.fortuneCommercePurchase.findFirst({
      where: {
        ...fortunePurchaseScope(scope, input.actorUserId),
        readingId: reading.id,
        status: 'PAID',
        deliveredAt: { not: null },
      },
      select: { id: true, followUpLimit: true },
    });
    if (!purchase) return null;
    return {
      scope,
      reading,
      revision: reading.participant.profileUpdatedAt,
      limit: purchase.followUpLimit,
      purchaseId: purchase.id,
    };
  }
  const settings = scope.guidanceSettings;
  const configured =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings.followUpLimit
      : undefined;
  const limit = configured === 0 || configured === 1 ? configured : 2;
  return { scope, reading, revision: reading.participant.profileUpdatedAt, limit };
}

type Eligible = NonNullable<Awaited<ReturnType<typeof eligible>>>;

function view(record: Eligible, now: Date) {
  return {
    remaining: Math.max(0, record.limit - record.reading.followUps.length),
    turns: record.reading.followUps.flatMap(
      ({ status, turn, question, answer, actionStep, createdAt }) =>
        status === 'ERASED' || question === null
          ? []
          : [
              {
                turn,
                question,
                status:
                  status === 'READY'
                    ? ('READY' as const)
                    : status === 'PENDING' && now.getTime() - createdAt.getTime() < 120_000
                      ? ('PENDING' as const)
                      : ('FAILED' as const),
                answer,
                actionStep,
              },
            ],
    ),
  };
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
    return record ? view(record, now) : null;
  }

  async reserve(input: Scope & { requestId: string; question: string }) {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const initial = await eligible(tx, input, now);
      if (!initial) return { kind: 'UNAVAILABLE' } as const;
      await lockReading(tx, initial);
      const record = await eligible(tx, input, now);
      if (!record) return { kind: 'UNAVAILABLE' } as const;
      const { scope, reading, revision, limit } = record;
      if (reading.followUps.some((turn) => turn.id === input.requestId))
        return { kind: 'REPLAY', view: view(record, now) } as const;
      if (reading.followUps.length >= limit) return { kind: 'LIMIT' } as const;
      const style = FORTUNE_PROFILE_STYLES.find(
        (value) => value === reading.participant.profileStyle,
      );
      await tx.fortuneReadingFollowUp.create({
        data: {
          id: input.requestId,
          readingId: reading.id,
          turn: reading.followUps.length + 1,
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
    const record = await eligible(this.db, input, new Date());
    return (
      record?.revision.getTime() === input.revision.getTime() &&
      record.reading.followUps.some(
        (turn) =>
          turn.id === input.requestId && turn.status === 'PENDING' && turn.turn <= record.limit,
      )
    );
  }

  async complete(
    input: Scope & { requestId: string; revision: Date; output: FortuneReadingOutput | null },
  ) {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const initial = await eligible(tx, input, now);
      if (!initial) return null;
      await lockReading(tx, initial);
      const record = await eligible(tx, input, now);
      if (!record || record.revision.getTime() !== input.revision.getTime()) return null;
      await tx.fortuneReadingFollowUp.updateMany({
        where: { id: input.requestId, readingId: input.readingId, status: 'PENDING' },
        data: input.output
          ? { status: 'READY', answer: input.output.body, actionStep: input.output.actionStep }
          : { status: 'FAILED' },
      });
      const completed = await eligible(tx, input, now);
      return completed ? view(completed, now) : null;
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
