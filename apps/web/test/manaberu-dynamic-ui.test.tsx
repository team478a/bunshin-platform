import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PersonalLearningRequestCard } from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/card';

const programPage = readFileSync(
  new URL('../app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx', import.meta.url),
  'utf8',
);
const learningRequestPage = readFileSync(
  new URL(
    '../app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/page.tsx',
    import.meta.url,
  ),
  'utf8',
);

describe('Manaberu dynamic learning UI', () => {
  it('routes DYNAMIC_V1 away from the fixed AiTrainingCard and keeps fixed legacy behavior', () => {
    expect(programPage).toContain("personalLearningMode(program.settings) === 'DYNAMIC_V1'");
    expect(programPage).toContain(
      'redirect(`/s/${serviceSlug}/programs/${programEnrollmentId}/learning-request`)',
    );
    expect(programPage).toContain('<AiTrainingCard');
    expect(
      programPage.indexOf("personalLearningMode(program.settings) === 'DYNAMIC_V1'"),
    ).toBeLessThan(programPage.indexOf('<AiTrainingCard'));
    expect(programPage).toContain('自由な学習希望を保存（検証中）');
    expect(learningRequestPage).toContain('内部テスト中');
    expect(learningRequestPage).toContain(
      "personalLearningMode(program?.settings) === 'DYNAMIC_V1'",
    );
  });

  it('uses learner-facing copy on the dynamic path without changing fixed-mode test copy', () => {
    const render = (dynamicMode: boolean) =>
      renderToStaticMarkup(
        createElement(PersonalLearningRequestCard, {
          dynamicMode,
          endpoint: '/request',
          initial: null,
          candidateEndpoint: '/candidate',
        }),
      );
    const dynamic = render(true);
    const fixed = render(false);

    expect(dynamic).toContain('希望を保存し、内容に合う小さな実践課題へ進みます');
    expect(dynamic).not.toContain('検証画面');
    expect(dynamic).not.toContain('準備中');
    expect(fixed).toContain('この検証画面では教材候補の確認までです');
  });
});
