import 'server-only';
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
        const [firstCompleted, retainedViews, reflections] = await Promise.all([
          db.prisma.fortuneReading.findMany({
            where: {
              serviceSettingId: setting.id,
              status: { in: [...readyScope.status.in] },
              createdAt: { gte: periodStart },
              participant: {
                groupMembership: {
                  serviceMembershipEvents: {
                    some: { eventType: 'REGISTRATION_COMPLETED', occurredAt: { gte: periodStart } },
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
        ]);
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
        };
      })()
    : undefined;
  return {
    periodDays: 30,
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
