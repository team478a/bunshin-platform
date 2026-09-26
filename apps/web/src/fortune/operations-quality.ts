import 'server-only';
import { fortuneOperatorScope } from './operator-scope';
import {
  assessFortuneQuality,
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
