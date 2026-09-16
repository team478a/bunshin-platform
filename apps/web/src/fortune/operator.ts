import 'server-only';
import {
  buildStandardFortuneKnowledgePack,
  FORTUNE_KNOWLEDGE_MEANING_COUNT,
  parseFortuneKnowledgePack,
  type FortuneKnowledgePack,
} from '@bunshin/capability-fortune';
import { ApplicationError } from '@bunshin/shared';
import { currentLineEnvironment } from '../line/secure-configuration';
import { resolveManagedServiceContext } from '../services/public-service';
import { isFortuneServicePackage } from '../services/service-creation-templates';
import { isFortuneLineReady } from './launch-readiness';

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
  lineReady: boolean;
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
  const lineEnvironment = currentLineEnvironment();
  const [configuration, linePolicy, dedicatedLine, sharedLineReadyCount] = await Promise.all([
    db.prisma.serviceConfiguration.findFirst({
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
    }),
    db.prisma.groupLineRoutingPolicy.findUnique({
      where: {
        workspaceId_groupId_environment: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          environment: lineEnvironment,
        },
      },
      select: { mode: true, pilotEnabled: true },
    }),
    db.prisma.groupLineChannelConfiguration.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        environment: lineEnvironment,
        status: 'ACTIVE',
      },
      select: { lastVerifiedAt: true, lastErrorCategory: true, globallyPaused: true },
    }),
    db.prisma.lineChannelConfiguration.count({
      where: {
        environment: lineEnvironment,
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    }),
  ]);
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
  const lineMode = linePolicy?.mode ?? 'SHARED';
  const lineReady = isFortuneLineReady({
    registrationLineEnabled: service.configuration.registration.lineEnabled,
    mode: lineMode,
    sharedLineReadyCount,
    dedicatedPilotEnabled: linePolicy?.pilotEnabled ?? false,
    dedicatedLastVerifiedAt: dedicatedLine?.lastVerifiedAt ?? null,
    dedicatedLastErrorCategory: dedicatedLine?.lastErrorCategory ?? null,
    dedicatedGloballyPaused: dedicatedLine?.globallyPaused ?? true,
  });
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
    lineReady,
    bunshinReady,
    canEnable:
      approvedMeaningCount === FORTUNE_KNOWLEDGE_MEANING_COUNT &&
      termsReady &&
      privacyReady &&
      brandReady &&
      lineReady &&
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

export async function installStandardFortunePackage(input: {
  serviceSlug: string;
  actorUserId: string;
}): Promise<{
  installed: boolean;
  bunshinId: string;
  version: number | null;
  meaningCount: number;
}> {
  const service = await scope(input.serviceSlug, input.actorUserId);
  if (!isFortuneServicePackage(service.configuration.registration.onboardingConfig))
    throw new ApplicationError('CONFLICT', 'fortune package is not selected for this service');

  const pack = buildStandardFortuneKnowledgePack();
  const db = await import('@bunshin/database');
  return db.prisma.$transaction(async (tx) => {
    const configuration = await tx.serviceConfiguration.findFirst({
      where: {
        id: service.configuration.id,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
      },
      select: {
        id: true,
        fortuneSetting: {
          select: {
            bunshinId: true,
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
    if (configuration.fortuneSetting) {
      const approved = configuration.fortuneSetting.knowledgeVersions[0];
      return {
        installed: false,
        bunshinId: configuration.fortuneSetting.bunshinId,
        version: approved?.version ?? null,
        meaningCount: approved?._count.cardMeanings ?? 0,
      };
    }

    const bunshin = await tx.bunshin.create({
      data: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        ownerUserId: input.actorUserId,
        name: '占い案内パートナー',
        slug: `fortune-${crypto.randomUUID()}`,
        type: 'EXPERT',
        status: 'ACTIVE',
        objectiveSummary: '毎日のカードを、安心して受け取れる生活のヒントとして案内します。',
        audienceSummary: '18歳以上の占いサービス参加者へ、恋愛・仕事・人間関係のヒントを届けます。',
        personalitySummary:
          '不安をあおらず、結果を断定せず、落ち着いた日本語で小さな行動を提案します。',
      },
      select: { id: true },
    });
    await tx.bunshinCapabilityAssignment.create({
      data: {
        workspaceId: service.workspaceId,
        bunshinId: bunshin.id,
        capabilityType: 'FORTUNE',
        status: 'ACTIVE',
        assignedByUserId: input.actorUserId,
      },
    });
    const setting = await tx.fortuneServiceSetting.create({
      data: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: configuration.id,
        bunshinId: bunshin.id,
        enabled: false,
        aiEnabled: false,
        minimumAge: 18,
        historyRetentionDays: 90,
        weeklyNotificationEnabled: false,
      },
      select: { id: true },
    });
    const knowledge = await tx.fortuneKnowledgeVersion.create({
      data: {
        serviceSettingId: setting.id,
        version: 1,
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
    await tx.fortuneKnowledgeVersion.update({
      where: { id: knowledge.id },
      data: {
        status: 'APPROVED',
        approvedByUserId: input.actorUserId,
        approvedAt: new Date(),
      },
    });
    return {
      installed: true,
      bunshinId: bunshin.id,
      version: 1,
      meaningCount: pack.meanings.length,
    };
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

export async function setFortuneAiEnabled(input: {
  serviceSlug: string;
  actorUserId: string;
  enabled: boolean;
}) {
  const status = await fortuneOperatorStatus(input.serviceSlug, input.actorUserId);
  if (!status.configured) throw new ApplicationError('CONFLICT', 'fortune is not configured');
  if (input.enabled) {
    if (!status.enabled)
      throw new ApplicationError('CONFLICT', 'publish fortune before enabling AI');
    const { resolveOpenAiRuntimeConfiguration } =
      await import('../ai/runtime-provider-configuration');
    await resolveOpenAiRuntimeConfiguration();
  }
  const service = await scope(input.serviceSlug, input.actorUserId);
  const db = await import('@bunshin/database');
  const updated = await db.prisma.fortuneServiceSetting.updateMany({
    where: { workspaceId: service.workspaceId, groupId: service.serviceId },
    data: { aiEnabled: input.enabled },
  });
  if (updated.count !== 1) throw new ApplicationError('NOT_FOUND', 'fortune setting not found');
  return { aiEnabled: input.enabled };
}
