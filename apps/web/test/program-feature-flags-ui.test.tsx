import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ProgramFeatureFlagsCard } from '../app/s/[serviceSlug]/manage/programs/program-feature-flags-card';

const fixed = {
  id: 'fixed',
  name: '30日研修',
  status: 'ACTIVE',
  updatedAt: '2026-11-25T00:00:00Z',
  learningMode: 'FIXED_DEFINITIONS_V1' as const,
  learningFeatures: {
    conversation: false,
    multiTopic: false,
    lineLearning: false,
    extendedScope: false,
    learningNudges: false,
    toolUpdates: false,
  },
  enabled: false,
  configurationValid: true,
  learningOfferPolicy: 'AI_SKILL_V1' as const,
  hasEnrollments: false,
};

const dynamic = {
  ...fixed,
  id: 'dynamic',
  name: 'Personal Learning',
  status: 'DRAFT',
  learningMode: 'DYNAMIC_V1' as const,
};

it('opens the dynamic program by default and explains where browser materials can be tested', () => {
  const render = (browserMaterialsAvailable: boolean) =>
    renderToStaticMarkup(
      <ProgramFeatureFlagsCard
        serviceSlug="manaberu-style"
        initialPrograms={[fixed, dynamic]}
        browserMaterialsAvailable={browserMaterialsAvailable}
      />,
    );
  const production = render(false);
  expect(production).toContain('<option value="dynamic" selected="">');
  expect(production).toContain('開発・ステージングで検証できます。');
  expect(production.match(/<input[^>]*id="feature-browserMaterials"[^>]*>/)?.[0]).toContain(
    'disabled=""',
  );

  const staging = render(true);
  expect(staging.match(/<input[^>]*id="feature-browserMaterials"[^>]*>/)?.[0]).not.toContain(
    'disabled=""',
  );
});
