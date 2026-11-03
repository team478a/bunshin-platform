import { ExternalGrantOwnerCard } from '../../../apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/connections/card';
import { externalGrantFixture } from './external-grants-fixture';
export function ExternalGrantsHarness() {
  return (
    <main className="app-page">
      <ExternalGrantOwnerCard
        endpoint="/api/synthetic/external-grants"
        initial={externalGrantFixture(new URLSearchParams(location.search).has('stopped'))}
      />
    </main>
  );
}
