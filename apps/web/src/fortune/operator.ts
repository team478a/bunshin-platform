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
import {
  FORTUNE_INITIAL_MEMBER_LIMIT,
  isFortuneServicePackage,
} from '../services/service-creation-templates';
import { isFortuneLineReady } from './launch-readiness';
import {
  assessFortuneQuality,
  summarizeFortuneMembershipActivity,
  summarizeFortuneAiOperations,
  type FortuneAiOperationsSummary,
  type FortuneMembershipActivitySummary,
  type FortuneQualityAssessment,
} from './quality';

export interface FortuneOperatorStatus {
  configured: boolean;
  enabled: boolean;
  aiEnabled: boolean;
  weeklyNotificationEnabled: boolean;
  weeklyNotificationDay: number;
  weeklyNotificationHour: number;
  timeZone: string;
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
  memberLimit: number | null;
  registeredParticipants: number;
  remainingParticipantSlots: number | null;
  bunshins: Array<{ id: string; name: string }>;
}

export interface FortuneOperationsQuality {
  periodDays: 30;
  activeParticipants: number;
  activeReaders: number;
  viewedReaders: number;
  repeatReaders: number;
  readingCount: number;
  aiReadingCount: number;
  basicReadingCount: number;
  failedReadingCount: number;
  deletedReadingCount: number;
  staleGeneratingCount: number;
  feedbackCount: number;
  helpfulFeedbackCount: number;
  somewhatFeedbackCount: number;
  notHelpfulFeedbackCount: number;
  feedbackIssues: Array<{ code: string; count: number }>;
  failures: Array<{ code: string; count: number }>;
  membershipActivity: FortuneMembershipActivitySummary;
  aiOperations: FortuneAiOperationsSummary;
  assessment: FortuneQualityAssessment;
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
  const now = new Date();
  const [
    configuration,
    linePolicy,
    dedicatedLine,
    sharedLineReadyCount,
    commercialSetting,
    registeredParticipants,
  ] = await Promise.all([
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
            weeklyNotificationEnabled: true,
            weeklyNotificationDay: true,
            weeklyNotificationHour: true,
            timeZone: true,
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
    db.prisma.serviceCommercialSetting.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'ACTIVE',
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      select: { includedMemberLimit: true },
    }),
    db.prisma.groupMembership.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        role: 'PARTICIPANT',
        status: { in: ['ACTIVE', 'PENDING_APPROVAL'] },
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
  const memberLimit = commercialSetting?.includedMemberLimit ?? null;
  return {
    configured: Boolean(configuration.fortuneSetting),
    enabled: configuration.fortuneSetting?.enabled ?? false,
    aiEnabled: configuration.fortuneSetting?.aiEnabled ?? false,
    weeklyNotificationEnabled: configuration.fortuneSetting?.weeklyNotificationEnabled ?? false,
    weeklyNotificationDay: configuration.fortuneSetting?.weeklyNotificationDay ?? 3,
    weeklyNotificationHour: configuration.fortuneSetting?.weeklyNotificationHour ?? 19,
    timeZone: configuration.fortuneSetting?.timeZone ?? 'Asia/Tokyo',
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
    memberLimit,
    registeredParticipants,
    remainingParticipantSlots:
      memberLimit === null ? null : Math.max(0, memberLimit - registeredParticipants),
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
    await tx.serviceCommercialSetting.upsert({
      where: { groupId: service.serviceId },
      create: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: configuration.id,
        planName: '占い限定公開 v1',
        billingMode: 'FREE',
        status: 'ACTIVE',
        monthlyPriceYen: null,
        includedMemberLimit: FORTUNE_INITIAL_MEMBER_LIMIT,
        monthlyAiGenerationLimit: null,
        monthlyImageGenerationLimit: null,
        monthlyVideoGenerationLimit: null,
        updatedByUserId: input.actorUserId,
      },
      update: {},
    });
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

export async function fortuneOperationsQuality(
  serviceSlug: string,
  actorUserId: string,
  now = new Date(),
): Promise<FortuneOperationsQuality | null> {
  const service = await scope(serviceSlug, actorUserId);
  const db = await import('@bunshin/database');
  const setting = await db.prisma.fortuneServiceSetting.findFirst({
    where: { workspaceId: service.workspaceId, groupId: service.serviceId },
    select: { id: true, bunshinId: true, aiEnabled: true },
  });
  if (!setting) return null;

  const periodStart = new Date(now.getTime() - 30 * 86_400_000);
  const staleBefore = new Date(now.getTime() - 10 * 60_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const monthKey = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`;
  const readingScope = { serviceSettingId: setting.id, createdAt: { gte: periodStart } };
  const [
    activeParticipants,
    statuses,
    readers,
    viewedReadings,
    staleGeneratingCount,
    failureRows,
    feedbackRows,
    feedbackIssueRows,
    commercialSetting,
    consumedGenerations,
    processingGenerations,
    aiUsage,
    membershipEvents,
  ] = await Promise.all([
    db.prisma.fortuneParticipant.count({
      where: {
        serviceSettingId: setting.id,
        groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
      },
    }),
    db.prisma.fortuneReading.groupBy({
      by: ['status'],
      where: readingScope,
      _count: { _all: true },
    }),
    db.prisma.fortuneReading.findMany({
      where: readingScope,
      distinct: ['memberUserId'],
      select: { memberUserId: true },
    }),
    db.prisma.fortuneReading.findMany({
      where: { ...readingScope, firstViewedAt: { not: null } },
      select: { memberUserId: true, localDate: true },
      orderBy: { localDate: 'asc' },
    }),
    db.prisma.fortuneReading.count({
      where: {
        serviceSettingId: setting.id,
        status: 'GENERATING',
        createdAt: { gte: periodStart, lt: staleBefore },
      },
    }),
    db.prisma.fortuneReading.groupBy({
      by: ['failureCode'],
      where: { ...readingScope, failureCode: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { failureCode: 'desc' } },
      take: 5,
    }),
    db.prisma.fortuneFeedback.groupBy({
      by: ['rating'],
      where: { serviceSettingId: setting.id, createdAt: { gte: periodStart } },
      _count: { _all: true },
    }),
    db.prisma.fortuneFeedback.groupBy({
      by: ['issueCode'],
      where: {
        serviceSettingId: setting.id,
        createdAt: { gte: periodStart },
        issueCode: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { issueCode: 'desc' } },
    }),
    db.prisma.serviceCommercialSetting.findFirst({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      select: { status: true, monthlyAiGenerationLimit: true },
    }),
    db.prisma.serviceAiGenerationReservation.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        monthKey,
        status: 'CONSUMED',
      },
    }),
    db.prisma.serviceAiGenerationReservation.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        monthKey,
        status: 'RESERVED',
        expiresAt: { gt: now },
      },
    }),
    db.prisma.aiUsageEvent.findMany({
      where: {
        workspaceId: service.workspaceId,
        bunshinId: setting.bunshinId,
        taskType: 'FORTUNE_DAILY_READING',
        occurredAt: { gte: monthStart, lt: nextMonthStart },
      },
      select: {
        status: true,
        inputTokens: true,
        outputTokens: true,
        estimatedCostUsdMicros: true,
      },
    }),
    db.prisma.serviceMembershipEvent.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        occurredAt: { gte: periodStart },
      },
      select: { eventType: true, groupMembershipId: true },
    }),
  ]);
  const count = (status: 'READY_AI' | 'READY_BASIC' | 'FAILED' | 'DELETED') =>
    statuses.find((row) => row.status === status)?._count._all ?? 0;
  const aiReadingCount = count('READY_AI');
  const basicReadingCount = count('READY_BASIC');
  const failedReadingCount = count('FAILED');
  const deletedReadingCount = count('DELETED');
  const viewedByUser = new Map<string, Set<string>>();
  for (const reading of viewedReadings) {
    const dates = viewedByUser.get(reading.memberUserId) ?? new Set<string>();
    dates.add(reading.localDate.toISOString().slice(0, 10));
    viewedByUser.set(reading.memberUserId, dates);
  }
  const feedbackCount = (rating: 'HELPFUL' | 'SOMEWHAT' | 'NOT_HELPFUL') =>
    feedbackRows.find((row) => row.rating === rating)?._count._all ?? 0;
  const helpfulFeedbackCount = feedbackCount('HELPFUL');
  const somewhatFeedbackCount = feedbackCount('SOMEWHAT');
  const notHelpfulFeedbackCount = feedbackCount('NOT_HELPFUL');
  return {
    periodDays: 30,
    activeParticipants,
    activeReaders: readers.length,
    viewedReaders: viewedByUser.size,
    repeatReaders: [...viewedByUser.values()].filter((dates) => dates.size >= 2).length,
    readingCount: aiReadingCount + basicReadingCount + failedReadingCount + deletedReadingCount,
    aiReadingCount,
    basicReadingCount,
    failedReadingCount,
    deletedReadingCount,
    staleGeneratingCount,
    feedbackCount: helpfulFeedbackCount + somewhatFeedbackCount + notHelpfulFeedbackCount,
    helpfulFeedbackCount,
    somewhatFeedbackCount,
    notHelpfulFeedbackCount,
    feedbackIssues: feedbackIssueRows.flatMap((row) =>
      row.issueCode ? [{ code: row.issueCode, count: row._count._all }] : [],
    ),
    failures: failureRows.flatMap((row) =>
      row.failureCode ? [{ code: row.failureCode, count: row._count._all }] : [],
    ),
    membershipActivity: summarizeFortuneMembershipActivity(membershipEvents),
    aiOperations: summarizeFortuneAiOperations({
      monthKey,
      commercialStatus: commercialSetting?.status ?? null,
      generationLimit:
        commercialSetting?.status === 'DRAFT'
          ? null
          : (commercialSetting?.monthlyAiGenerationLimit ?? null),
      consumedGenerations,
      processingGenerations,
      usage: aiUsage,
    }),
    assessment: assessFortuneQuality({
      aiEnabled: setting.aiEnabled,
      aiReadingCount,
      basicReadingCount,
      failedReadingCount,
      staleGeneratingCount,
    }),
  };
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

export async function setFortuneWeeklyNotification(input: {
  serviceSlug: string;
  actorUserId: string;
  enabled: boolean;
  weekday: number;
  hour: number;
}) {
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6)
    throw new ApplicationError('VALIDATION_ERROR', 'weekday must be between 0 and 6');
  if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23)
    throw new ApplicationError('VALIDATION_ERROR', 'hour must be between 0 and 23');
  const status = await fortuneOperatorStatus(input.serviceSlug, input.actorUserId);
  if (!status.configured) throw new ApplicationError('CONFLICT', 'fortune is not configured');
  if (input.enabled && (!status.enabled || !status.lineReady))
    throw new ApplicationError(
      'CONFLICT',
      'publish fortune and complete LINE setup before enabling notifications',
    );
  const service = await scope(input.serviceSlug, input.actorUserId);
  const db = await import('@bunshin/database');
  const updated = await db.prisma.fortuneServiceSetting.updateMany({
    where: { workspaceId: service.workspaceId, groupId: service.serviceId },
    data: {
      weeklyNotificationEnabled: input.enabled,
      weeklyNotificationDay: input.weekday,
      weeklyNotificationHour: input.hour,
    },
  });
  if (updated.count !== 1) throw new ApplicationError('NOT_FOUND', 'fortune setting not found');
  return {
    weeklyNotificationEnabled: input.enabled,
    weeklyNotificationDay: input.weekday,
    weeklyNotificationHour: input.hour,
  };
}
