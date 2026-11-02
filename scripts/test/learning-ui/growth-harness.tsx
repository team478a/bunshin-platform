// Synthetic browser fixture only. Uses the production component; never authenticates or calls a DB.
import { useState } from 'react';
import { HassyMemberGrowthRoadmap } from '../../../apps/web/app/ui/member-growth-roadmap/card';
import { growthBase } from './growth-fixture';

export function GrowthHarness() {
  const [other, setOther] = useState(false);
  return (
    <main style={{ maxWidth: 720, margin: 'auto', padding: 12 }}>
      <section id="today-post" tabIndex={-1}>
        <h1>今日やること</h1>
      </section>
      <button type="button" onClick={() => setOther((value) => !value)}>
        テスト用Bunshin切替
      </button>
      <HassyMemberGrowthRoadmap
        endpointBase={
          other
            ? growthBase.replace(
                '11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222',
              )
            : growthBase
        }
      />
    </main>
  );
}
