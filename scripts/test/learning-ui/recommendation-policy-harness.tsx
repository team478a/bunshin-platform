import { RecommendationPolicyEditor } from '../../../apps/web/app/s/[serviceSlug]/manage/recommendations/policy-editor';
import { recommendationPolicyFixture } from './recommendation-policy-fixture';
export function RecommendationPolicyHarness() {
  const query = new URLSearchParams(location.search);
  const initial = recommendationPolicyFixture(query.has('hq'));
  if (query.has('unconfigured')) {
    initial.revision = 0;
    initial.headquarters = null;
  }
  return (
    <main className="app-page">
      <h1>SNS支援提案の設定</h1>
      <RecommendationPolicyEditor
        endpoint="/api/synthetic/recommendation-policy"
        initial={initial}
      />
    </main>
  );
}
