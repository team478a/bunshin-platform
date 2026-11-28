import {
  ListUnknownAiUsageCosts,
  ListAiProviderConfigurations,
  ListOpenAiProviderRuntimeAdmissions,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { currentAiProviderEnvironment } from '../../../../src/ai/secure-provider-configuration';
import { personalLearningPricingRegistry } from '../../../../src/observability/personal-learning-ai-call';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { AiProviderConfigurationEditor } from './provider-configuration-editor';
import { AiProviderAdmissionRecovery } from './provider-admission-recovery';
import { AiUsageCostReconciliation } from './ai-usage-cost-reconciliation';

export const dynamic = 'force-dynamic';

const usd = (micros: bigint | null) =>
  micros === null
    ? '—'
    : new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 6,
      }).format(Number(micros) / 1_000_000);

export default async function AiProviderConfigurationPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  try {
    const environment = currentAiProviderEnvironment();
    const repository = new db.PrismaAiProviderConfigurationRepository(
      db.prisma,
      personalLearningPricingRegistry(),
    );
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const [configurations, admissions, unknownCosts, currentEstimates, previousEstimates] =
      await Promise.all([
        new ListAiProviderConfigurations(repository).execute(user.userId, environment),
        new ListOpenAiProviderRuntimeAdmissions(repository).execute(user.userId, environment),
        new ListUnknownAiUsageCosts(new db.PrismaAiUsageCostReconciliationRepository()).execute({
          actorUserId: user.userId,
          environment,
          provider: 'OPENAI',
          limit: 100,
        }),
        repository.listUsageCostEstimatesForAdmin(user.userId, monthStart, now),
        repository.listUsageCostEstimatesForAdmin(user.userId, previousMonthStart, monthStart),
      ]);
    return (
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">管理者専用</p>
          <h1>AIと検索サービスの設定</h1>
          <p>文章を作るAIと、話題を調べる検索サービスを準備します。</p>
        </header>
        <section className="settings-card">
          <h2>現在の環境</h2>
          <p>
            <strong>{environment}</strong>
          </p>
          <p>ここで登録した設定は、ほかの環境では使われません。</p>
        </section>
        {environment !== 'PRODUCTION' && (
          <section className="settings-card">
            <h2>教材のナレーション</h2>
            <Link href="/admin/ai/speech" className="button button--secondary">
              Azure Speechの設定
            </Link>
          </section>
        )}
        <AiProviderConfigurationEditor
          environment={environment}
          initialConfigurations={configurations.map((value) => ({
            ...value,
            lastVerifiedAt: value.lastVerifiedAt?.toISOString() ?? null,
            createdAt: value.createdAt.toISOString(),
            updatedAt: value.updatedAt.toISOString(),
          }))}
        />
        <AiProviderAdmissionRecovery
          initialSummaries={admissions.summaries.map((summary) => ({
            ...summary,
            oldestAdmittedAt: summary.oldestAdmittedAt.toISOString(),
          }))}
          recoveryScanTruncated={admissions.recoveryScanTruncated}
          canRecover={admissions.canRecover}
        />
        <section className="settings-card">
          <h2>Provider別の概算AI原価</h2>
          <p>米ドル・UTC月単位。予算判定用の仮計上は概算総額に含めません。</p>
          {[
            { label: '今月', estimates: currentEstimates },
            { label: '前月', estimates: previousEstimates },
          ].map(({ label, estimates }) => (
            <div key={label}>
              <h3>{label}</h3>
              {estimates?.length ? (
                <ul>
                  {estimates.map((row) => {
                    const total =
                      row.recordedUsdMicros === null && row.tokenEstimateUsdMicros === null
                        ? null
                        : (row.recordedUsdMicros ?? 0n) + (row.tokenEstimateUsdMicros ?? 0n);
                    return (
                      <li key={row.provider}>
                        <strong>{row.provider}</strong> {usd(total)}
                        {'（'}記録済み {usd(row.recordedUsdMicros)}、トークン概算{' '}
                        {usd(row.tokenEstimateUsdMicros)}、概算に含まれない {row.excludedCalls}件
                        {'）'}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>利用記録はありません。</p>
              )}
            </div>
          ))}
        </section>
        <AiUsageCostReconciliation
          initialRows={unknownCosts.rows.map((row) => ({
            ...row,
            occurredAt: row.occurredAt.toISOString(),
          }))}
        />
        <section className="settings-card">
          <h2>AIツールの公式更新情報</h2>
          <p>公式の更新情報を登録し、学習テーマ候補として使う前に運営者が確認できます。</p>
          <Link href="/admin/ai/tool-features" className="button button--secondary">
            更新情報の確認へ
          </Link>
        </section>
        <section className="settings-card">
          <h2>トレンド調査サービスをくらべる</h2>
          <p>同じ質問の結果と費用を記録し、Grok・Exa・Firecrawlを公平に比較します。</p>
          <Link href="/admin/ai/benchmark" className="button button--secondary">
            比較画面を開く
          </Link>
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}
