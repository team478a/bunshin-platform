import type {
  CreateFortuneReadingResult,
  FortuneOrientation,
  FortuneAiGenerationClaim,
  FortuneAiReadingResult,
  FortuneParticipantView,
  FortuneReadingView,
  FortuneRepository,
  FortuneTheme,
} from '@bunshin/capability-fortune';
import { TAROT_DECK } from '@bunshin/capability-fortune';
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
const cardName = (code: string) => TAROT_DECK.find((card) => card.code === code)?.nameJa ?? code;

async function target(db: Db, serviceSlug: string, actorUserId: string) {
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

async function view(
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
    createdAt: row.createdAt,
  };
}

export class PrismaFortuneRepository implements FortuneRepository {
  constructor(private readonly db: PrismaClient) {}

  async joinParticipant(input: {
    serviceSlug: string;
    actorUserId: string;
    ageConfirmedAt: Date;
  }): Promise<FortuneParticipantView | null> {
    return this.db.$transaction(async (tx) => {
      const scope = await target(tx, input.serviceSlug, input.actorUserId);
      const membership = scope?.group.memberships[0];
      if (!scope || !membership) return null;
      const participant = await tx.fortuneParticipant.upsert({
        where: {
          serviceSettingId_userId: { serviceSettingId: scope.id, userId: input.actorUserId },
        },
        update: { withdrawnAt: null },
        create: {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          serviceSettingId: scope.id,
          groupMembershipId: membership.id,
          userId: input.actorUserId,
          ageConfirmedAt: input.ageConfirmedAt,
        },
      });
      return {
        id: participant.id,
        ageConfirmedAt: participant.ageConfirmedAt,
        notificationEnabled: participant.notificationEnabled,
      };
    });
  }

  async findParticipant(input: {
    serviceSlug: string;
    actorUserId: string;
  }): Promise<FortuneParticipantView | null> {
    const scope = await target(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const participant = await this.db.fortuneParticipant.findFirst({
      where: { serviceSettingId: scope.id, userId: input.actorUserId, withdrawnAt: null },
    });
    return participant
      ? {
          id: participant.id,
          ageConfirmedAt: participant.ageConfirmedAt,
          notificationEnabled: participant.notificationEnabled,
        }
      : null;
  }

  async findReadingForDate(input: {
    serviceSlug: string;
    actorUserId: string;
    localDate: string;
  }): Promise<FortuneReadingView | null> {
    const scope = await target(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const participant = await this.db.fortuneParticipant.findFirst({
      where: { serviceSettingId: scope.id, userId: input.actorUserId, withdrawnAt: null },
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
    return reading ? view(this.db, reading) : null;
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
      const scope = await target(tx, input.serviceSlug, input.actorUserId);
      if (!scope) return { kind: 'NOT_AVAILABLE' };
      const participant = await tx.fortuneParticipant.findFirst({
        where: { serviceSettingId: scope.id, userId: input.actorUserId, withdrawnAt: null },
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
      return { kind: 'READY', reading: await view(tx, reading) };
    });
  }

  async claimAiGeneration(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
  }): Promise<FortuneAiGenerationClaim | null> {
    return this.db.$transaction(async (tx) => {
      const scope = await target(tx, input.serviceSlug, input.actorUserId);
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
      return {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        bunshinId: scope.bunshinId,
        reading: await view(tx, reading),
      };
    });
  }

  async completeAiGeneration(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    output: FortuneAiReadingResult;
  }): Promise<FortuneReadingView | null> {
    const scope = await target(this.db, input.serviceSlug, input.actorUserId);
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
    return row ? view(this.db, row) : null;
  }

  async fallbackAiGeneration(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    failureCode: string;
  }): Promise<FortuneReadingView | null> {
    const scope = await target(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    await this.db.fortuneReading.updateMany({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
        status: 'GENERATING',
      },
      data: { status: 'READY_BASIC', failureCode: input.failureCode, modelName: null },
    });
    const row = await this.db.fortuneReading.findFirst({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
      },
    });
    return row ? view(this.db, row) : null;
  }

  async listReadings(input: {
    serviceSlug: string;
    actorUserId: string;
    limit: number;
  }): Promise<FortuneReadingView[] | null> {
    const scope = await target(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const participant = await this.db.fortuneParticipant.findFirst({
      where: { serviceSettingId: scope.id, userId: input.actorUserId, withdrawnAt: null },
    });
    if (!participant) return null;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - scope.historyRetentionDays);
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
    return Promise.all(rows.map((row) => view(this.db, row)));
  }

  async findReading(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
  }): Promise<FortuneReadingView | null> {
    const scope = await target(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const row = await this.db.fortuneReading.findFirst({
      where: {
        id: input.readingId,
        serviceSettingId: scope.id,
        memberUserId: input.actorUserId,
        status: { not: 'DELETED' },
      },
    });
    return row ? view(this.db, row) : null;
  }

  async deleteReading(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    deletedAt: Date;
  }): Promise<boolean> {
    const scope = await target(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return false;
    const result = await this.db.fortuneReading.updateMany({
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
        modelName: null,
        failureCode: null,
        deletedAt: input.deletedAt,
      },
    });
    return result.count === 1;
  }
}
