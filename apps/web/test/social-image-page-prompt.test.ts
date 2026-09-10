import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { socialImagePagePrompt } from '../src/jobs/social-image-generation-job-handler';

describe('social image carousel page prompt', () => {
  it('uses the prepared scene and requires a different composition on later pages', () => {
    const prompt = socialImagePagePrompt(
      {
        templateKey: 'EDITORIAL_POINT',
        headline: 'カフェの集客は看板から',
        bodyLines: ['通りかかった人が読める文字数にする'],
        visualScene: '店主が店頭の黒板メニューを書き直す手元を斜め上から撮る',
      },
      true,
      2,
      5,
    );

    expect(prompt).toContain('page 3 of 5');
    expect(prompt).toContain('店主が店頭の黒板メニューを書き直す');
    expect(prompt).toContain('must visibly differ');
    expect(prompt).toContain('Do not render text');
    expect(prompt).toContain('identity and style reference');
  });
});
