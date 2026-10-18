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
const trainingPage = readFileSync(
  new URL('../app/s/[serviceSlug]/training/page.tsx', import.meta.url),
  'utf8',
);
const practiceCard = readFileSync(
  new URL(
    '../app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/practice-card.tsx',
    import.meta.url,
  ),
  'utf8',
);
const conversationCard = readFileSync(
  new URL(
    '../app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/conversation-card.tsx',
    import.meta.url,
  ),
  'utf8',
);
const candidateCard = readFileSync(
  new URL(
    '../app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/candidate-card.tsx',
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

    expect(dynamic).toContain(
      '書いてくれた希望をもとに、あなたに合った小さな練習を一緒に考えます。今進めている練習は、新しい練習を始めるまでそのまま残ります。',
    );
    expect(dynamic).toContain('<summary>くわしく伝える（任意）</summary>');
    expect(dynamic).not.toContain('<details open');
    expect(dynamic).toContain('例：お店のチラシの文章をAIで作れるようになりたい');
    expect(dynamic).toContain('この内容で始める');
    expect(dynamic).not.toContain('検証画面');
    expect(dynamic).not.toContain('準備中');
    expect(dynamic).not.toContain('version');
    expect(dynamic).not.toContain('前回保存した希望（版');
    expect(fixed).toContain('この検証画面では教材候補の確認までです');
    expect(fixed).not.toContain('<details>');
    expect(fixed).toContain('希望を保存');
  });

  it('keeps saved optional inputs and avoids showing the revision number in Manaberu dynamic mode', () => {
    const dynamic = renderToStaticMarkup(
      createElement(PersonalLearningRequestCard, {
        dynamicMode: true,
        endpoint: '/request',
        initial: {
          id: 'request-1',
          revision: 12,
          createdAt: '2026-10-19T00:00:00.000Z',
          originalText: '店のチラシの文章を作りたい',
          deviceType: 'PC',
          toolDescription: 'ChatGPT',
          experienceDescription: '少し使ったことがある',
          currentPosition: '文章を一度作った',
        },
      }),
    );
    const fixed = renderToStaticMarkup(
      createElement(PersonalLearningRequestCard, {
        dynamicMode: false,
        endpoint: '/request',
        initial: {
          id: 'request-2',
          revision: 12,
          createdAt: '2026-10-19T00:00:00.000Z',
          originalText: '店のチラシの文章を作りたい',
          deviceType: 'PC',
          toolDescription: 'ChatGPT',
          experienceDescription: '少し使ったことがある',
          currentPosition: '文章を一度作った',
        },
      }),
    );

    expect(dynamic).toContain('前回の希望：店のチラシの文章を作りたい');
    expect(dynamic).not.toContain('版 12');
    expect(dynamic).toContain('ChatGPT</textarea>');
    expect(dynamic).toContain('少し使ったことがある</textarea>');
    expect(dynamic).toContain('文章を一度作った</textarea>');
    expect(fixed).toContain('前回保存した希望（版 12）：');
  });

  it('uses plain Japanese in participant learning and training-state copy without changing consent records', () => {
    expect(learningRequestPage).toContain("service.configuration.slug === 'manaberu-style'");
    expect(trainingPage).toContain("serviceSlug === 'manaberu-style'");
    expect(trainingPage).toContain('研修への参加手続きと参加枠を準備しています');
    expect(trainingPage).toContain('参加枠が準備できるまで、AIを使った学習は始まりません');
    expect(practiceCard).toContain('あなたが報告してくれた内容です。');
    expect(conversationCard).toContain(
      '学習を手伝うための返答です。達成や合格を決めるものではありません。',
    );
    expect(candidateCard).toContain('この練習の内容を確認してください。');
    expect(candidateCard).toContain('教材版 ${candidate.materialVersion}');
    expect(trainingPage).toContain('この研修Enrollmentでの外部AI利用に同意します');
  });
});
