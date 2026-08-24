import {
  evaluateTrendProviderBenchmark,
  type TrendProviderBenchmarkObservation,
} from '@bunshin/capability-social';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { currentAiProviderEnvironment } from '../../../../../src/ai/secure-provider-configuration';
import { TrendBenchmarkEditor } from './benchmark-editor';

export const dynamic = 'force-dynamic';

export default async function TrendProviderBenchmarkPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    user.userId,
  );
  if (!admin) notFound();
  const environment = currentAiProviderEnvironment();
  const cases = await db.prisma.trendProviderBenchmarkCase.findMany({
    where: { environment, active: true },
    include: { observations: { orderBy: { provider: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  const expected = cases.map((item) => item.caseKey);
  const now = new Date();
  const observations: TrendProviderBenchmarkObservation[] = cases.flatMap((item) =>
    item.observations.map((value) => {
      const evidence = Array.isArray(value.evidence)
        ? (value.evidence as Array<{ url: string; publishedAt: string | null }>)
        : [];
      return {
        caseId: item.caseKey,
        providerKey: value.provider,
        query: {
          query: item.query,
          language: item.language,
          country: item.country,
          publishedAfter: new Date(now.getTime() - item.lookbackDays * 86_400_000),
          maximumResults: item.maximumResults,
        },
        result: value.successful
          ? {
              providerKey: value.provider,
              items: evidence.map((row) => ({
                url: row.url,
                title: '保存した根拠',
                publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
                highlights: [],
              })),
              creditsUsed: null,
              latencyMs: value.latencyMs,
            }
          : null,
        costUsdMicros: value.costUsdMicros,
        relevanceRating: value.relevanceRating,
        sourceQualityRating: value.sourceQualityRating,
        failed: !value.successful,
      };
    }),
  );
  const report =
    observations.length > 0 && expected.length > 0
      ? evaluateTrendProviderBenchmark(observations, expected)
      : null;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>トレンド調査をくらべる</h1>
        <p>{environment}環境。Grok・Exa・Firecrawlを同じ質問で比べます。</p>
      </header>
      <TrendBenchmarkEditor
        cases={cases.map((item) => ({
          id: item.id,
          title: item.title,
          observations: item.observations.map((value) => ({ provider: value.provider })),
        }))}
      />
      <section className="settings-card">
        <h2>比較結果</h2>
        {!report ? (
          <p>結果を保存すると、ここに点数が出ます。</p>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>サービス</th>
                    <th>総合点</th>
                    <th>成功</th>
                    <th>内容</th>
                    <th>情報元</th>
                    <th>根拠</th>
                    <th>新しさ</th>
                    <th>平均費用</th>
                    <th>判定</th>
                  </tr>
                </thead>
                <tbody>
                  {report.scores.map((score) => (
                    <tr key={score.providerKey}>
                      <td>{score.providerKey}</td>
                      <td>{score.averageScore}</td>
                      <td>
                        {score.successfulCases}/{score.totalCases}
                      </td>
                      <td>{score.metrics.relevance}</td>
                      <td>{score.metrics.sourceQuality}</td>
                      <td>{score.metrics.coverage}</td>
                      <td>{score.metrics.freshness}</td>
                      <td>${(score.averageCostUsdMicros / 1_000_000).toFixed(4)}</td>
                      <td>{score.eligibleForReview ? '採用候補' : '追加確認'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              <strong>単独候補：{report.recommendation ?? 'なし。人が確認してください。'}</strong>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
