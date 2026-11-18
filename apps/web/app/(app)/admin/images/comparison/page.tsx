import {
  SOCIAL_IMAGE_COMPARISON_DATASET_VERSION,
  SOCIAL_IMAGE_COMPARISON_INDUSTRIES,
  SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES,
  aggregateSocialImageProviderComparison,
  selectSocialImageProvider,
  type SocialImageComparisonIndustry,
  type SocialImageComparisonProvider,
  type SocialImageProviderFeature,
} from '@bunshin/application';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentAiProviderEnvironment } from '../../../../../src/ai/secure-provider-configuration';
import { currentUserProvider } from '../../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const industryLabels: Record<SocialImageComparisonIndustry, string> = {
  BEAUTY_SALON: '美容院',
  RESTAURANT: '飲食店',
  EC_PRODUCT: 'EC商品',
  SERVICE: 'サービス紹介',
};
const providerLabels: Record<SocialImageComparisonProvider, string> = {
  OPENAI: 'OpenAI',
  XAI: 'xAI',
};
const rejectionLabels = {
  STOPPED: '停止中',
  NOT_CONFIGURED: '接続設定なし',
  FEATURE_UNSUPPORTED: '必要機能に未対応',
  COST_LIMIT_EXCEEDED: '費用上限超過',
  QUALITY_BELOW_MINIMUM: '品質基準未満',
  SUCCESS_RATE_BELOW_MINIMUM: '成功率基準未満',
} as const;

const isIndustry = (value: string | undefined): value is SocialImageComparisonIndustry =>
  SOCIAL_IMAGE_COMPARISON_INDUSTRIES.some((industry) => industry === value);

const money = (micros: number) => `$${(micros / 1_000_000).toFixed(3)}`;

function SyntheticFixturePreview({
  provider,
  headline,
  direction,
}: {
  provider: SocialImageComparisonProvider;
  headline: string;
  direction: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${providerLabels[provider]}の合成fixture。${headline}`}
      style={{
        aspectRatio: '4 / 5',
        background:
          provider === 'OPENAI'
            ? 'linear-gradient(145deg, #fff3ea, #e9d9ff)'
            : 'linear-gradient(145deg, #e8f7ff, #d8f6e8)',
        border: '1px solid var(--border-color, #d7d7d7)',
        borderRadius: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        maxWidth: '180px',
        minWidth: '140px',
        padding: '1rem',
      }}
    >
      <small>合成fixture・{providerLabels[provider]}</small>
      <strong style={{ fontSize: '1.1rem' }}>{headline}</strong>
      <small>{direction}</small>
    </div>
  );
}

export default async function SocialImageProviderComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ industry?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await db.prisma.platformAdmin.findFirst({
    where: { userId: actor.userId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!admin) notFound();

  const query = await searchParams;
  const selectedIndustry = isIndustry(query.industry) ? query.industry : null;
  const visibleCases = selectedIndustry
    ? SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES.filter((item) => item.industry === selectedIndustry)
    : SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES;
  const aggregates = aggregateSocialImageProviderComparison(visibleCases);
  const environment = currentAiProviderEnvironment();
  const configurations = await db.prisma.aiProviderConfiguration.findMany({
    where: {
      environment,
      provider: { in: ['OPENAI', 'XAI'] },
      capabilityKey: { in: ['GENERAL', 'SOCIAL_IMAGE_GENERATION'] },
    },
    orderBy: { version: 'desc' },
    select: {
      provider: true,
      capabilityKey: true,
      status: true,
      apiKeyMask: true,
      model: true,
      requestCostUsdMicros: true,
      globallyPaused: true,
      lastVerifiedAt: true,
      lastErrorCategory: true,
    },
  });
  const configurationFor = (provider: SocialImageComparisonProvider) => {
    const matching = configurations.filter(
      (item) =>
        item.provider === provider &&
        (item.capabilityKey === 'SOCIAL_IMAGE_GENERATION' ||
          (provider === 'OPENAI' && item.capabilityKey === 'GENERAL')),
    );
    return matching.find((item) => item.status === 'ACTIVE') ?? matching[0] ?? null;
  };
  const features: readonly SocialImageProviderFeature[] = [
    'TEXT_TO_IMAGE',
    'REFERENCE_IMAGE',
    'PERSON_CONSISTENCY',
  ];
  const candidates = aggregates.map((aggregate) => {
    const configuration = configurationFor(aggregate.provider);
    return {
      ...aggregate,
      averageCostUsdMicros:
        configuration && configuration.requestCostUsdMicros > 0
          ? configuration.requestCostUsdMicros
          : aggregate.averageCostUsdMicros,
      configured: Boolean(configuration?.apiKeyMask),
      active: Boolean(
        configuration?.status === 'ACTIVE' &&
        !configuration.globallyPaused &&
        configuration.lastVerifiedAt &&
        !configuration.lastErrorCategory,
      ),
      features,
      model: configuration?.model ?? null,
    };
  });
  const selection = selectSocialImageProvider(candidates, {
    requiredFeatures: ['TEXT_TO_IMAGE', 'REFERENCE_IMAGE'],
    maximumCostUsdMicros: 100_000,
    minimumQualityScore: 3.5,
    minimumSuccessRate: 90,
  });

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用・合成fixture</p>
        <h1>画像生成サービスをくらべる</h1>
        <p>
          4業種・20題材でOpenAIとxAIの評価画面と選択規則を確認します。実APIの生成結果や実運用の品質証拠ではありません。
        </p>
      </header>

      <section className="notice notice--danger" aria-label="fixtureの注意事項">
        <strong>この比較値は画面・集計・ルール検証用の合成データです。</strong>
        <br />
        Providerの採用、料金確定、本番自動切替には使用しません。実API比較は費用承認後に別途実施します。
      </section>

      <section className="settings-card">
        <h2>題材を絞り込む</h2>
        <p>
          <Link href="/admin/images/comparison">全20題材</Link>
          {' ／ '}
          {SOCIAL_IMAGE_COMPARISON_INDUSTRIES.map((industry, index) => (
            <span key={industry}>
              {index > 0 ? ' ／ ' : ''}
              <Link href={`/admin/images/comparison?industry=${industry}` as Route}>
                {industryLabels[industry]}（5）
              </Link>
            </span>
          ))}
        </p>
        <p>
          表示中：{selectedIndustry ? industryLabels[selectedIndustry] : '全業種'}・
          {visibleCases.length}
          題材 ／ Dataset: {SOCIAL_IMAGE_COMPARISON_DATASET_VERSION}
        </p>
      </section>

      <section className="settings-card">
        <h2>比較集計</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>画像品質</th>
                <th>日本語</th>
                <th>ブランド</th>
                <th>人物</th>
                <th>成功率</th>
                <th>時間</th>
                <th>単価</th>
                <th>再生成率</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((item) => (
                <tr key={item.provider}>
                  <td>{providerLabels[item.provider]}</td>
                  <td>{item.averageImageQuality} / 5</td>
                  <td>{item.averageJapaneseLegibility} / 5</td>
                  <td>{item.averageBrandFit} / 5</td>
                  <td>
                    {item.averagePersonConsistency === null
                      ? '対象なし'
                      : `${item.averagePersonConsistency} / 5`}
                  </td>
                  <td>
                    {item.successRate}%（{item.successfulCases}/{item.caseCount}）
                  </td>
                  <td>{(item.averageLatencyMs / 1000).toFixed(1)}秒</td>
                  <td>{money(item.averageCostUsdMicros)}</td>
                  <td>{item.regenerationRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="settings-card">
        <h2>決定的ルールのプレビュー</h2>
        <p>
          停止状態 → 接続設定 → 必要機能 → 1回$0.100以下 → 総合品質3.5以上 →
          成功率90%以上の順で除外し、品質・成功率・再生成率・費用・時間・Provider名の固定順で選びます。
        </p>
        <p>
          <strong>
            選択候補：
            {selection.selectedProvider
              ? providerLabels[selection.selectedProvider]
              : 'なし（条件を満たすProviderがありません）'}
          </strong>
        </p>
        <ul>
          {candidates.map((candidate) => {
            const rejection = selection.rejected.find(
              (item) => item.provider === candidate.provider,
            );
            return (
              <li key={candidate.provider}>
                {providerLabels[candidate.provider]} — {candidate.model ?? 'モデル未設定'} ／{' '}
                {rejection
                  ? rejection.reasons.map((reason) => rejectionLabels[reason]).join('、')
                  : '条件を満たす'}
              </li>
            );
          })}
        </ul>
        <p>
          <Link href="/admin/ai">モデル・料金・上限・停止状態をAI Provider設定で確認する</Link>
        </p>
      </section>

      <section className="settings-card">
        <h2>題材別fixture</h2>
        {visibleCases.map((item) => (
          <article key={item.caseKey} className="settings-card" style={{ marginBlock: '1rem' }}>
            <p className="eyebrow">{industryLabels[item.industry]}</p>
            <h3>{item.title}</h3>
            <p>
              <strong>目的：</strong>
              {item.purpose}
              <br />
              <strong>制作指示：</strong>
              {item.promptSummary}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>プレビュー</th>
                    <th>合成fixtureの見出し・構図</th>
                    <th>品質</th>
                    <th>日本語</th>
                    <th>ブランド</th>
                    <th>人物</th>
                    <th>結果</th>
                  </tr>
                </thead>
                <tbody>
                  {item.observations.map((observation) => (
                    <tr key={observation.provider}>
                      <td>{providerLabels[observation.provider]}</td>
                      <td>
                        <SyntheticFixturePreview
                          provider={observation.provider}
                          headline={observation.fixtureHeadline}
                          direction={observation.fixtureDirection}
                        />
                      </td>
                      <td>
                        <strong>{observation.fixtureHeadline}</strong>
                        <br />
                        {observation.fixtureDirection}
                      </td>
                      <td>{observation.imageQuality} / 5</td>
                      <td>{observation.japaneseLegibility} / 5</td>
                      <td>{observation.brandFit} / 5</td>
                      <td>
                        {observation.personConsistency === null
                          ? '対象なし'
                          : `${observation.personConsistency} / 5`}
                      </td>
                      <td>
                        {observation.successful ? '成功fixture' : '失敗fixture'}
                        {observation.regenerationRequired ? '・再生成想定' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>

      <p>
        <Link href="/admin/images">画像生成の試験運用へ戻る</Link>
      </p>
    </main>
  );
}
