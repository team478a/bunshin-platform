import { UsageGuidancePolicyEditor } from '../../../apps/web/app/s/[serviceSlug]/manage/recommendations/usage-policy-editor';
import { usagePolicyFixture } from './usage-guidance-policy-fixture';
export function UsagePolicyHarness() {
  return (
    <main className="app-page">
      <UsageGuidancePolicyEditor
        endpoint="/api/synthetic/usage-guidance-policy"
        initial={usagePolicyFixture(new URLSearchParams(location.search).has('hq'))}
      />
    </main>
  );
}
