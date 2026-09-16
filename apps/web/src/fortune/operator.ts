import 'server-only';
import {
  buildStandardFortuneKnowledgePack,
  FORTUNE_KNOWLEDGE_MEANING_COUNT,
  parseFortuneKnowledgePack,
  type FortuneKnowledgePack,
} from '@bunshin/capability-fortune';
import { ApplicationError } from '@bunshin/shared';
import { resolveManagedServiceContext } from '../services/public-service';

export interface FortuneOperatorStatus {
  configured: boolean;
  enabled: boolean;
  aiEnabled: boolean;
  bunshinId: string | null;
  approvedVersion: number | null;
  approvedMeaningCount: number;
  requiredMeaningCount: number;
  termsReady: boolean;
  privacyReady: boolean;
  brandReady: boolean;
  bunshinReady: boolean;
  canEnable: boolean;
  bunshins: Array<{ id: string; name: string }>;
}

async function scope(serviceSlug: string, actorUserId: string) {
  try {
    return await resolveManagedServiceContext(serviceSlug, actorUserId);
  } catch (error) {
    if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND')
      throw new ApplicationError('NOT_FOUND', 'service not found');
    throw error;
  }
}

export async function fortuneOperatorStatus(
  serviceSlug: string,
  actorUserId: string,
): Promise<FortuneOperatorStatus> {
  const service = await scope(serviceSlug, actorUserId);
  const db = await import('@bunshin/database');
  const configuration = await db.prisma.serviceConfiguration.findFirst({
    where: {
      id: service.configuration.id,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
    },
    select: {
      contactEmail: true,
      brand: { select: { logoUrl: true } },
      legalDocuments: {
        where: { status: 'PUBLISHED' },
        select: { type: true },
      },
      fortuneSetting: {
        select: {
          enabled: true,
          aiEnabled: true,
          bunshinId: true,
          bunshin: {
            select: {
              status: true,
              capabilityAssignments: {
                where: { capabilityType: 'FORTUNE', status: 'ACTIVE' },
                select: { id: true },
              },
            },
          },
          knowledgeVersions: {
            where: { status: 'APPROVED' },
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              version: true,
              _count: { select: { cardMeanings: { where: { safetyReviewed: true } } } },
            },
          },
        },
      },
    },
  });
  if (!configuration) throw new ApplicationError('NOT_FOUND', 'service not found');
  const bunshins = await db.prisma.bunshin.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      status: 'ACTIVE',
    },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  const approved = configuration.fortuneSetting?.knowledgeVersions[0];
  const approvedMeaningCount = approved?._count.cardMeanings ?? 0;
  const termsReady = configuration.legalDocuments.some((item) => item.type === 'TERMS');
  const privacyReady = configuration.legalDocuments.some((item) => item.type === 'PRIVACY');
  const brandReady = Boolean(configuration.brand?.logoUrl && configuration.contactEmail);
  const bunshinReady = Boolean(
    configuration.fortuneSetting?.bunshin.status === 'ACTIVE' &&
    configuration.fortuneSetting.bunshin.capabilityAssignments.length === 1,
  );
  return {
    configured: Boolean(configuration.fortuneSetting),
    enabled: configuration.fortuneSetting?.enabled ?? false,
    aiEnabled: configuration.fortuneSetting?.aiEnabled ?? false,
    bunshinId: configuration.fortuneSetting?.bunshinId ?? null,
    approvedVersion: approved?.version ?? null,
    approvedMeaningCount,
    requiredMeaningCount: FORTUNE_KNOWLEDGE_MEANING_COUNT,
    termsReady,
    privacyReady,
    brandReady,
    bunshinReady,
    canEnable:
      approvedMeaningCount === FORTUNE_KNOWLEDGE_MEANING_COUNT &&
      termsReady &&
      privacyReady &&
      brandReady &&
      bunshinReady,
    bunshins,
  };
}

export async function importFortuneKnowledge(input: {
  serviceSlug: string;
  actorUserId: string;
  bunshinId: string;
  pack: unknown;
}): Promise<{ version: number; meaningCount: number }> {
  const service = await scope(input.serviceSlug, input.actorUserId);
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
    const latest = await tx.fortuneKnowledgeVersion.aggregate({
      where: { serviceSettingId: setting.id },
      _max: { version: true },
    });
    const version = (latest._max.version ?? 0) + 1;
    const knowledge = await tx.fortuneKnowledgeVersion.create({
      data: {
        serviceSettingId: setting.id,
        version,
        status: 'DRAFT',
        promptVersion: pack.promptVersion,
      },
      select: { id: true },
    });
    await tx.fortuneCardMeaning.createMany({
      data: pack.meanings.map((meaning) => ({
        knowledgeVersionId: knowledge.id,
        ...meaning,
        safetyReviewed: true,
      })),
    });
    await tx.fortuneKnowledgeVersion.updateMany({
      where: { serviceSettingId: setting.id, status: 'APPROVED' },
      data: { status: 'RETIRED' },
    });
    await tx.fortuneKnowledgeVersion.update({
      where: { id: knowledge.id },
      data: {
        status: 'APPROVED',
        approvedByUserId: input.actorUserId,
        approvedAt: new Date(),
      },
    });
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

export async function setFortuneEnabled(input: {
  serviceSlug: string;
  actorUserId: string;
  enabled: boolean;
}) {
  const status = await fortuneOperatorStatus(input.serviceSlug, input.actorUserId);
  if (!status.configured) throw new ApplicationError('CONFLICT', 'fortune is not configured');
  if (input.enabled && !status.canEnable)
    throw new ApplicationError('CONFLICT', 'fortune launch requirements are incomplete');
  const service = await scope(input.serviceSlug, input.actorUserId);
  const db = await import('@bunshin/database');
  const updated = await db.prisma.fortuneServiceSetting.updateMany({
    where: { workspaceId: service.workspaceId, groupId: service.serviceId },
    data: { enabled: input.enabled },
  });
  if (updated.count !== 1) throw new ApplicationError('NOT_FOUND', 'fortune setting not found');
  return { enabled: input.enabled };
}
