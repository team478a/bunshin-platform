import 'server-only';
import {
  buildStandardFortuneKnowledgePack,
  parseFortuneKnowledgePack,
  isCustomFortuneCardCode,
  readFortuneDeck,
  type FortuneDeckCard,
  type FortuneKnowledgePack,
} from '@bunshin/capability-fortune';
import type { Prisma } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import { fortuneOperatorScope } from './operator-scope';

export async function publishFortuneKnowledge(
  tx: Prisma.TransactionClient,
  settingId: string,
  actorUserId: string,
  pack: FortuneKnowledgePack,
  deck: FortuneDeckCard[],
) {
  const latest = await tx.fortuneKnowledgeVersion.aggregate({
    where: { serviceSettingId: settingId },
    _max: { version: true },
  });
  const version = (latest._max.version ?? 0) + 1;
  await tx.fortuneKnowledgeVersion.updateMany({
    where: { serviceSettingId: settingId, status: 'APPROVED' },
    data: { status: 'RETIRED' },
  });
  await tx.fortuneKnowledgeVersion.create({
    data: {
      serviceSettingId: settingId,
      version,
      status: 'APPROVED',
      promptVersion: pack.promptVersion,
      deck,
      approvedByUserId: actorUserId,
      approvedAt: new Date(),
      cardMeanings: {
        createMany: {
          data: pack.meanings.map((meaning) => ({ ...meaning, safetyReviewed: true })),
        },
      },
    },
  });
  return version;
}

export async function importFortuneKnowledge(input: {
  serviceSlug: string;
  actorUserId: string;
  bunshinId: string;
  pack: unknown;
}): Promise<{ version: number; meaningCount: number }> {
  const service = await fortuneOperatorScope(input.serviceSlug, input.actorUserId);
  const pack: FortuneKnowledgePack = parseFortuneKnowledgePack(input.pack);
  const db = await import('@bunshin/database');
  return db.prisma.$transaction(async (tx) => {
    const [configuration, bunshin] = await Promise.all([
      tx.serviceConfiguration.findFirst({
        where: {
          id: service.configuration.id,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
        },
        select: { id: true },
      }),
      tx.bunshin.findFirst({
        where: {
          id: input.bunshinId,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
    ]);
    if (!configuration || !bunshin)
      throw new ApplicationError('NOT_FOUND', 'service Bunshin not found');
    const existingAssignment = await tx.bunshinCapabilityAssignment.findUnique({
      where: {
        workspaceId_bunshinId_capabilityType: {
          workspaceId: service.workspaceId,
          bunshinId: bunshin.id,
          capabilityType: 'FORTUNE',
        },
      },
      select: { status: true },
    });
    if (existingAssignment?.status === 'LOCKED')
      throw new ApplicationError('CONFLICT', 'locked capability cannot be activated');
    await tx.bunshinCapabilityAssignment.upsert({
      where: {
        workspaceId_bunshinId_capabilityType: {
          workspaceId: service.workspaceId,
          bunshinId: bunshin.id,
          capabilityType: 'FORTUNE',
        },
      },
      create: {
        workspaceId: service.workspaceId,
        bunshinId: bunshin.id,
        capabilityType: 'FORTUNE',
        status: 'ACTIVE',
        assignedByUserId: input.actorUserId,
      },
      update: {
        status: 'ACTIVE',
        assignedByUserId: input.actorUserId,
        activatedAt: new Date(),
      },
    });
    const previousSetting = await tx.fortuneServiceSetting.findUnique({
      where: { groupId: service.serviceId },
      select: {
        bunshinId: true,
        bunshin: {
          select: {
            capabilityAssignments: {
              where: { capabilityType: 'FORTUNE' },
              select: { id: true, status: true },
              take: 1,
            },
          },
        },
      },
    });
    if (previousSetting && previousSetting.bunshinId !== bunshin.id) {
      const previousAssignment = previousSetting.bunshin.capabilityAssignments[0];
      if (previousAssignment?.status === 'LOCKED')
        throw new ApplicationError('CONFLICT', 'locked capability cannot be moved');
      if (previousAssignment)
        await tx.bunshinCapabilityAssignment.update({
          where: { id: previousAssignment.id },
          data: { status: 'SUSPENDED' },
        });
    }
    const setting = await tx.fortuneServiceSetting.upsert({
      where: { groupId: service.serviceId },
      create: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: configuration.id,
        bunshinId: bunshin.id,
      },
      update: { bunshinId: bunshin.id },
      select: { id: true },
    });
    const previous = await tx.fortuneKnowledgeVersion.findFirst({
      where: { serviceSettingId: setting.id, status: 'APPROVED' },
      orderBy: { version: 'desc' },
      select: {
        deck: true,
        cardMeanings: {
          where: { cardCode: { startsWith: 'CUSTOM_' }, safetyReviewed: true },
          select: {
            cardCode: true,
            orientation: true,
            theme: true,
            title: true,
            body: true,
            actionStep: true,
          },
        },
      },
    });
    const version = await publishFortuneKnowledge(
      tx,
      setting.id,
      input.actorUserId,
      {
        ...pack,
        meanings: [
          ...pack.meanings,
          ...(previous?.cardMeanings.filter((row) => isCustomFortuneCardCode(row.cardCode)) ?? []),
        ],
      },
      readFortuneDeck(previous?.deck),
    );
    return { version, meaningCount: pack.meanings.length };
  });
}

export async function importStandardFortuneKnowledge(input: {
  serviceSlug: string;
  actorUserId: string;
  bunshinId: string;
}) {
  return importFortuneKnowledge({
    ...input,
    pack: buildStandardFortuneKnowledgePack(),
  });
}
