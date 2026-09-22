import type { TrendOperationsRepository, TrendOperationsSnapshot } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
export class PrismaTrendOperationsRepository implements TrendOperationsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async snapshot(
    input: Parameters<TrendOperationsRepository['snapshot']>[0],
  ): Promise<TrendOperationsSnapshot | null> {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    const period = { gte: input.from, lt: input.to };
    const runPeriod = { createdAt: period };
    const missionPeriod = { createdAt: period };
    const [
      runs,
      candidates,
      evidence,
      attributed,
      decisions,
      copied,
      posted,
      benchmarkCosts,
      trendUsage,
    ] = await Promise.all([
      this.client.trendResearchRun.findMany({
        where: runPeriod,
        select: { status: true, providerKey: true, failureCategory: true },
      }),
      this.client.trendIdeaCandidate.findMany({
        where: { researchRun: { is: runPeriod } },
        select: { status: true, safetyStatus: true, freshnessScore: true },
      }),
      this.client.trendEvidence.findMany({
        where: { researchRun: { is: runPeriod } },
        select: { status: true, expiresAt: true },
      }),
      this.client.missionTrendContext.count({ where: missionPeriod }),
      this.client.missionDecision.findMany({
        where: {
          decidedAt: { lt: input.to },
          dailyMission: { is: { trendContext: { is: missionPeriod } } },
        },
        select: { decision: true },
      }),
      this.client.missionActivity.findMany({
        where: {
          occurredAt: { lt: input.to },
          type: {
            in: [
              'COPIED_TEXT',
              'COPIED_SLIDE',
              'COPIED_IMAGE_INSTRUCTION',
              'COPIED_VIDEO_PROMPT',
              'COPIED_SCRIPT',
            ],
          },
          dailyMission: { is: { trendContext: { is: missionPeriod } } },
        },
        distinct: ['dailyMissionId'],
        select: { dailyMissionId: true },
      }),
      this.client.postRecord.count({
        where: {
          postedAt: { lt: input.to },
          dailyMission: { is: { trendContext: { is: missionPeriod } } },
        },
      }),
      this.client.trendProviderBenchmarkObservation.findMany({
        where: { benchmarkCase: { is: { environment: input.environment, active: true } } },
        select: { costUsdMicros: true },
      }),
      this.client.aiUsageEvent.findMany({
        where: { taskType: 'TREND_RESEARCH', occurredAt: period },
        select: {
          status: true,
          provider: true,
          errorCode: true,
          estimatedCostUsdMicros: true,
        },
      }),
    ]);
    const providerMap = new Map<string, { runs: number; failed: number }>();
    const failureMap = new Map<string, number>();
    for (const run of runs) {
      const provider = providerMap.get(run.providerKey) ?? { runs: 0, failed: 0 };
      provider.runs += 1;
      if (run.status === 'FAILED') provider.failed += 1;
      providerMap.set(run.providerKey, provider);
      if (run.status === 'FAILED') {
        const category = run.failureCategory ?? '原因未分類';
        failureMap.set(category, (failureMap.get(category) ?? 0) + 1);
      }
    }
    for (const usage of trendUsage.filter(({ status }) => status === 'FAILED')) {
      const provider = providerMap.get(usage.provider) ?? { runs: 0, failed: 0 };
      provider.runs += 1;
      provider.failed += 1;
      providerMap.set(usage.provider, provider);
      const category = usage.errorCode ?? '原因未分類';
      failureMap.set(category, (failureMap.get(category) ?? 0) + 1);
    }
    const freshnessTotal = candidates.reduce((sum, value) => sum + value.freshnessScore, 0);
    const asOf = input.to < new Date() ? input.to : new Date();
    return {
      period: { from: input.from, to: input.to },
      research: {
        total: runs.length + trendUsage.filter(({ status }) => status === 'FAILED').length,
        completed: runs.filter(({ status }) => status === 'COMPLETED').length,
        failed:
          runs.filter(({ status }) => status === 'FAILED').length +
          trendUsage.filter(({ status }) => status === 'FAILED').length,
        expired: runs.filter(({ status }) => status === 'EXPIRED').length,
        failureCategories: [...failureMap.entries()]
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
      },
      candidates: {
        total: candidates.length,
        safe: candidates.filter(({ safetyStatus }) => safetyStatus === 'SAFE').length,
        selected: candidates.filter(({ status }) => status === 'SELECTED').length,
        averageFreshnessScore:
          candidates.length === 0 ? null : Math.round(freshnessTotal / candidates.length),
      },
      missions: {
        attributed,
        accepted: decisions.filter(({ decision }) => decision === 'ACCEPTED').length,
        rejected: decisions.filter(({ decision }) => decision === 'REJECTED').length,
        copied: copied.length,
        posted,
      },
      evidence: {
        total: evidence.length,
        available: evidence.filter(
          ({ status, expiresAt }) => status === 'ACTIVE' && expiresAt > asOf,
        ).length,
        expired: evidence.filter(
          ({ status, expiresAt }) => status === 'EXPIRED' || expiresAt <= asOf,
        ).length,
      },
      providers: [...providerMap.entries()]
        .map(([providerKey, value]) => ({ providerKey, ...value }))
        .sort((a, b) => a.providerKey.localeCompare(b.providerKey)),
      cost: {
        measuredUsdMicros: trendUsage.some(
          ({ estimatedCostUsdMicros }) => estimatedCostUsdMicros !== null,
        )
          ? Number(
              trendUsage.reduce((sum, value) => sum + (value.estimatedCostUsdMicros ?? 0n), 0n),
            )
          : null,
        unpricedRuns: trendUsage.filter(
          ({ estimatedCostUsdMicros }) => estimatedCostUsdMicros === null,
        ).length,
        benchmarkAverageUsdMicros:
          benchmarkCosts.length === 0
            ? null
            : Math.round(
                benchmarkCosts.reduce((sum, value) => sum + value.costUsdMicros, 0) /
                  benchmarkCosts.length,
              ),
      },
    };
  }
}
