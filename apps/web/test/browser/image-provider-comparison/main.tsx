import {
  SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES,
  aggregateSocialImageProviderComparison,
  selectSocialImageProvider,
} from '@bunshin/application';
import { createRoot } from 'react-dom/client';
import '../../../app/styles.css';

const cases = SOCIAL_IMAGE_PROVIDER_COMPARISON_FIXTURES.filter(
  (item) => item.industry === 'BEAUTY_SALON',
);
const aggregates = aggregateSocialImageProviderComparison(cases);
const selection = selectSocialImageProvider(
  aggregates.map((item) => ({
    ...item,
    active: true,
    configured: true,
    features: ['TEXT_TO_IMAGE', 'REFERENCE_IMAGE', 'PERSON_CONSISTENCY'] as const,
  })),
  {
    requiredFeatures: ['TEXT_TO_IMAGE', 'REFERENCE_IMAGE'],
    maximumCostUsdMicros: 100_000,
    minimumQualityScore: 3.5,
    minimumSuccessRate: 80,
  },
);

function Harness() {
  return (
    <main className="app-page" style={{ maxWidth: 390, margin: '0 auto' }}>
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用・合成fixture</p>
        <h1>画像生成サービスをくらべる</h1>
        <p>390px幅の合成ブラウザfixtureです。API・DB・認証・Provider呼出しはありません。</p>
      </header>
      <section className="notice notice--danger">
        <strong>実API結果や本番判断の証拠ではありません。</strong>
      </section>
      <section className="settings-card">
        <h2>題材を絞り込む</h2>
        <p>全20題材 ／ 美容院（5） ／ 飲食店（5） ／ EC商品（5） ／ サービス紹介（5）</p>
      </section>
      <section className="settings-card">
        <h2>比較集計</h2>
        <div className="table-scroll" data-testid="aggregate-scroll">
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
              {aggregates.map((item) => (
                <tr key={item.provider}>
                  <td>{item.provider}</td>
                  <td>{item.averageImageQuality}</td>
                  <td>{item.averageJapaneseLegibility}</td>
                  <td>{item.averageBrandFit}</td>
                  <td>{item.averagePersonConsistency}</td>
                  <td>{item.successRate}%</td>
                  <td>{item.averageLatencyMs}ms</td>
                  <td>${(item.averageCostUsdMicros / 1_000_000).toFixed(3)}</td>
                  <td>{item.regenerationRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="settings-card">
        <h2>決定的ルールのプレビュー</h2>
        <p>選択候補：{selection.selectedProvider ?? 'なし'}</p>
      </section>
      <section className="settings-card">
        <h2>題材別fixture</h2>
        {cases.map((item) => (
          <article key={item.caseKey} className="settings-card" style={{ marginBlock: '1rem' }}>
            <h3>{item.title}</h3>
            <p>{item.promptSummary}</p>
            <div className="table-scroll" data-testid="case-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>見出し・構図</th>
                    <th>品質</th>
                    <th>日本語</th>
                    <th>ブランド</th>
                  </tr>
                </thead>
                <tbody>
                  {item.observations.map((observation) => (
                    <tr key={observation.provider}>
                      <td>{observation.provider}</td>
                      <td>
                        <strong>{observation.fixtureHeadline}</strong>
                        <br />
                        {observation.fixtureDirection}
                      </td>
                      <td>{observation.imageQuality}</td>
                      <td>{observation.japaneseLegibility}</td>
                      <td>{observation.brandFit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(<Harness />);
