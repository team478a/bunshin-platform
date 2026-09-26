import type {
  FortuneOrientation,
  FortuneFeedbackIssue,
  FortuneReadingView,
  FortuneTheme,
} from '@bunshin/capability-fortune';
import { TAROT_DECK } from '@bunshin/capability-fortune';
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
const cardName = (code: string) => TAROT_DECK.find((card) => card.code === code)?.nameJa ?? code;

export async function fortuneTarget(db: Db, serviceSlug: string, actorUserId: string) {
  return db.fortuneServiceSetting.findFirst({
    where: {
      enabled: true,
      configuration: { slug: serviceSlug },
      bunshin: {
        status: 'ACTIVE',
        capabilityAssignments: { some: { capabilityType: 'FORTUNE', status: 'ACTIVE' } },
      },
      workspace: { status: 'ACTIVE' },
      group: {
        status: 'ACTIVE',
        memberships: {
          some: { userId: actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
        },
      },
    },
    include: {
      group: {
        include: {
          memberships: {
            where: { userId: actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
            take: 1,
          },
        },
      },
    },
  });
}

async function meaningForReading(
  db: Db,
  reading: {
    knowledgeVersionId: string | null;
    cardCode: string;
    orientation: FortuneOrientation;
    theme: FortuneTheme;
  },
) {
  if (!reading.knowledgeVersionId) return null;
  return db.fortuneCardMeaning.findFirst({
    where: {
      knowledgeVersionId: reading.knowledgeVersionId,
      cardCode: reading.cardCode,
      orientation: reading.orientation,
      theme: reading.theme,
      safetyReviewed: true,
    },
  });
}

export async function fortuneReadingView(
  db: Db,
  row: {
    id: string;
    localDate: Date;
    theme: FortuneTheme;
    cardCode: string;
    orientation: FortuneOrientation;
    status: 'GENERATING' | 'READY_AI' | 'READY_BASIC' | 'FAILED' | 'DELETED';
    readingText: string | null;
    actionStep: string | null;
    knowledgeVersionId: string | null;
    createdAt: Date;
  },
): Promise<FortuneReadingView> {
  const meaning = await meaningForReading(db, row);
  const feedback = await db.fortuneFeedback.findUnique({
    where: { readingId: row.id },
    select: { rating: true, issueCode: true },
  });
  return {
    id: row.id,
    localDate: row.localDate.toISOString().slice(0, 10),
    theme: row.theme,
    cardCode: row.cardCode,
    cardNameJa: cardName(row.cardCode),
    orientation: row.orientation,
    status: row.status,
    title: meaning?.title ?? null,
    body: row.readingText,
    actionStep: row.actionStep,
    feedbackRating: feedback?.rating ?? null,
    feedbackIssue: (feedback?.issueCode as FortuneFeedbackIssue | null | undefined) ?? null,
    createdAt: row.createdAt,
  };
}
