import { RoadmapPolicyEditor } from '../../../apps/web/app/s/[serviceSlug]/manage/roadmap/policy-editor';
import { roadmapPolicyFixture } from './roadmap-policy-fixture';
export function RoadmapPolicyHarness() {
  const query = new URLSearchParams(location.search),
    initial = roadmapPolicyFixture(query.has('hq'));
  if (query.has('unconfigured')) {
    initial.revision = 0;
    initial.headquarters = null;
  }
  return (
    <main className="app-page">
      <h1>成長ロードマップの達成条件</h1>
      <RoadmapPolicyEditor endpoint="/api/synthetic/roadmap-policy" initial={initial} />
    </main>
  );
}
