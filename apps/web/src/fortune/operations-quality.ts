import 'server-only';
import { fortuneDeepReadingEnabled, toJapanLocalDate } from '@bunshin/capability-fortune';
import { FORTUNE_DEEP_READING_PROMPT_VERSION } from '../providers/openai-fortune-reading-generator';
import { FORTUNE_INTAKE_PROMPT_VERSION } from '../providers/openai-fortune-intake';
import { fortuneOperatorScope } from './operator-scope';
import {
  assessFortuneQuality,
  fortuneRate,
  fortuneReturnRate,
  summarizeFortuneMembershipActivity,
  summarizeFortuneAiOperations,
  type FortuneAiOperationsSummary,
  type FortuneMembershipActivitySummary,
  type FortuneQualityAssessment,
} from './quality';

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
  personalGuidance?: {
    firstCompletionRate: number | null;
    secondUseRate: number | null;
    return7Rate: number | null;
    return30Rate: number | null;
    reflectionRate: number | null;
    suggestionUseRate: number | null;
    personalFit: { very: number; somewhat: number; notMuch: number };
    followUpUseRate: number | null;
    followUpReadings: number;
  };
  deepGuidance?: {
    starts: number;
    reviewed: number;
    skipped: number;
    abandoned: number;
    questionAverage: number | null;
    completionRate: number | null;
    skipRate: number | null;
    readings: number;
    returnedReaders: number;
    returnRate: number | null;
    fit: { very: number; somewhat: number; notMuch: number };
    intakeAi: FortuneAiOperationsSummary;
    readingAi: FortuneAiOperationsSummary;
  };
  aiOperations: FortuneAiOperationsSummary;
  assessment: FortuneQualityAssessment;
}

export async function fortuneOperationsQuality(
  serviceSlug: string,
  actorUserId: string,
  now = new Date(),
): Promise<FortuneOperationsQuality | null> {
  const service = await fortuneOperatorScope(serviceSlug, actorUserId);
  const db = await import('@bunshin/database');
  const setting = await db.prisma.fortuneServiceSetting.findFirst({
    where: { workspaceId: service.workspaceId, groupId: service.serviceId },
    select: {
      id: true,
      bunshinId: true,
      aiEnabled: true,
      personalProfileEnabled: true,
      reflectionEnabled: true,
      historyRetentionDays: true,
      guidanceSettings: true,
    },
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
        promptVersion: true,
        actorUserId: true,
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
  const membershipActivity = summarizeFortuneMembershipActivity(membershipEvents);
  const personalGuidance = setting.personalProfileEnabled
    ? await (async () => {
        const readyScope = {
          serviceSettingId: setting.id,
          status: { in: ['READY_BASIC', 'READY_AI'] as const },
        };
        const cohortStart = new Date(now.getTime() - 60 * 86_400_000);
        const eligibleFollowUps = {
          serviceSettingId: setting.id,
          status: { in: [...readyScope.status.in] },
          deletedAt: null,
          localDate: { gte: db.fortuneReadingRetentionCutoff(now, setting.historyRetentionDays) },
          firstViewedAt: { gte: periodStart, lt: now },
        };
        const [firstCompleted, retainedViews, reflections, fit, followUpViews, followUpReadings] =
          await Promise.all([
            db.prisma.fortuneReading.findMany({
              where: {
                serviceSettingId: setting.id,
                status: { in: [...readyScope.status.in] },
                createdAt: { gte: periodStart },
                participant: {
                  groupMembership: {
                    serviceMembershipEvents: {
                      some: {
                        eventType: 'REGISTRATION_COMPLETED',
                        occurredAt: { gte: periodStart },
                      },
                    },
                  },
                },
              },
              distinct: ['participantId'],
              select: { participantId: true },
            }),
            db.prisma.fortuneReading.findMany({
              where: {
                serviceSettingId: setting.id,
                status: { in: [...readyScope.status.in] },
                createdAt: { gte: cohortStart },
                firstViewedAt: { not: null },
              },
              select: { memberUserId: true, localDate: true },
            }),
            setting.reflectionEnabled
              ? db.prisma.fortuneReading.groupBy({
                  by: ['reflectionAnswer'],
                  where: { ...readingScope, status: { in: [...readyScope.status.in] } },
                  _count: { _all: true },
                })
              : [],
            db.prisma.fortuneReading.groupBy({
              by: ['personalFitRating'],
              where: {
                serviceSettingId: setting.id,
                status: 'READY_AI',
                deletedAt: null,
                localDate: eligibleFollowUps.localDate,
                personalFitRatedAt: { gte: periodStart, lt: now },
              },
              _count: { _all: true },
            }),
            db.prisma.fortuneReading.count({ where: eligibleFollowUps }),
            db.prisma.fortuneReading.count({
              where: {
                ...eligibleFollowUps,
                followUps: { some: { status: { not: 'ERASED' }, createdAt: { lt: now } } },
              },
            }),
          ]);
        const fitCount = (rating: 'VERY' | 'SOMEWHAT' | 'NOT_MUCH') =>
          fit.find((row) => row.personalFitRating === rating)?._count._all ?? 0;
        const cohortDates = new Map<string, Set<string>>();
        for (const { memberUserId, localDate } of retainedViews) {
          const dates = cohortDates.get(memberUserId) ?? new Set<string>();
          dates.add(localDate.toISOString().slice(0, 10));
          cohortDates.set(memberUserId, dates);
        }
        const reflected = reflections
          .filter((row) => row.reflectionAnswer !== null)
          .reduce((sum, row) => sum + row._count._all, 0);
        const tried = reflections
          .filter(
            (row) =>
              row.reflectionAnswer === 'TRIED_CHANGED' ||
              row.reflectionAnswer === 'TRIED_NO_CHANGE',
          )
          .reduce((sum, row) => sum + row._count._all, 0);
        return {
          firstCompletionRate: fortuneRate(
            firstCompleted.length,
            membershipActivity.registeredParticipants,
          ),
          secondUseRate: fortuneRate(
            [...viewedByUser.values()].filter((dates) => dates.size >= 2).length,
            viewedByUser.size,
          ),
          return7Rate: fortuneReturnRate(cohortDates, now, 7),
          return30Rate: fortuneReturnRate(cohortDates, now, 30),
          reflectionRate: setting.reflectionEnabled
            ? fortuneRate(reflected, aiReadingCount + basicReadingCount)
            : null,
          suggestionUseRate: fortuneRate(tried, reflected),
          personalFit: {
            very: fitCount('VERY'),
            somewhat: fitCount('SOMEWHAT'),
            notMuch: fitCount('NOT_MUCH'),
          },
          followUpUseRate: fortuneRate(followUpReadings, followUpViews),
          followUpReadings,
        };
      })()
    : undefined;
  const today = new Date(toJapanLocalDate(now));
  const intakeScope = {
    participant: {
      serviceSettingId: setting.id,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
    },
    localDate: {
      gte: db.fortuneReadingRetentionCutoff(now, Math.min(setting.historyRetentionDays, 30)),
      lte: today,
    },
  };
  const deepScope = {
    ...readingScope,
    status: 'READY_AI' as const,
    deletedAt: null,
    localDate: { gte: db.fortuneReadingRetentionCutoff(now, setting.historyRetentionDays) },
    deepReading: { not: db.Prisma.DbNull },
  };
  const [intakes, deepReadings, deepFit, deepViews] = await Promise.all([
    db.prisma.fortuneIntakeSession.groupBy({
      by: ['outcome', 'localDate'],
      where: intakeScope,
      _count: { _all: true },
      _sum: { questionsShown: true },
    }),
    db.prisma.fortuneReading.count({ where: deepScope }),
    db.prisma.fortuneReading.groupBy({
      by: ['personalFitRating'],
      where: { ...deepScope, personalFitRatedAt: { gte: periodStart, lt: now } },
      _count: { _all: true },
    }),
    db.prisma.fortuneReading.findMany({
      where: {
        ...deepScope,
        firstViewedAt: { not: null },
        localDate: { ...deepScope.localDate, lt: today },
      },
      select: { memberUserId: true, localDate: true },
    }),
  ]);
  const byOutcome = (outcome: string | null) =>
    intakes.filter((row) => row.outcome === outcome).reduce((sum, row) => sum + row._count._all, 0);
  const activeIntakes = intakes
    .filter((row) => row.outcome === null && row.localDate.getTime() === today.getTime())
    .reduce((sum, row) => sum + row._count._all, 0);
  const starts = intakes.reduce((sum, row) => sum + row._count._all, 0);
  const reviewed = byOutcome('REVIEWED');
  const skipped = byOutcome('SKIPPED');
  const abandoned = Math.max(0, byOutcome(null) - activeIntakes);
  const returning = new Map<string, boolean>();
  for (const { memberUserId, localDate } of deepViews) {
    const date = localDate.toISOString().slice(0, 10);
    if (returning.get(memberUserId)) continue;
    returning.set(
      memberUserId,
      [...(viewedByUser.get(memberUserId) ?? [])].some((later) => later > date),
    );
  }
  const returnedReaders = [...returning.values()].filter(Boolean).length;
  const fitCount = (rating: string) =>
    deepFit.find((row) => row.personalFitRating === rating)?._count._all ?? 0;
  const aiFor = (versions: string[]) =>
    summarizeFortuneAiOperations({
      monthKey,
      commercialStatus: null,
      generationLimit: null,
      consumedGenerations: 0,
      processingGenerations: 0,
      usage: aiUsage.filter((row) => versions.includes(row.promptVersion)),
    });
  const intakeAi = aiFor(['fortune-dynamic-intake-v1', FORTUNE_INTAKE_PROMPT_VERSION]);
  const readingAi = aiFor(['fortune-deep-reading-v1', FORTUNE_DEEP_READING_PROMPT_VERSION]);
  const deepGuidance =
    fortuneDeepReadingEnabled(setting.guidanceSettings) ||
    starts ||
    deepReadings ||
    intakeAi.successfulCalls ||
    intakeAi.failedCalls ||
    readingAi.successfulCalls ||
    readingAi.failedCalls
      ? {
          starts,
          reviewed,
          skipped,
          abandoned,
          questionAverage: starts
            ? intakes.reduce((sum, row) => sum + (row._sum.questionsShown ?? 0), 0) / starts
            : null,
          completionRate: fortuneRate(reviewed, starts - activeIntakes),
          skipRate: fortuneRate(skipped + abandoned, starts - activeIntakes),
          readings: deepReadings,
          returnedReaders,
          returnRate: fortuneRate(returnedReaders, returning.size),
          fit: {
            very: fitCount('VERY'),
            somewhat: fitCount('SOMEWHAT'),
            notMuch: fitCount('NOT_MUCH'),
          },
          intakeAi,
          readingAi,
        }
      : undefined;
  return {
    periodDays: 30,
    ...(deepGuidance ? { deepGuidance } : {}),
    ...(personalGuidance ? { personalGuidance } : {}),
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
    membershipActivity,
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
