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
      [
        {
          headline: 'カフェの看板を改善',
          visualScene: '店頭の黒板メニューを正面から見る',
        },
        {
          headline: '読めない看板',
          visualScene: '通行人が小さな文字を読みづらそうに見る',
        },
        {
          headline: 'カフェの集客は看板から',
          visualScene: '店主が店頭の黒板メニューを書き直す手元を斜め上から撮る',
        },
      ],
    );

    expect(prompt).toContain('page 3 of 5');
    expect(prompt).toContain('insight: visualize the cause or key realization');
    expect(prompt).toContain('店主が店頭の黒板メニューを書き直す');
    expect(prompt).toContain('must visibly differ');
    expect(prompt).toContain('Do not render text');
    expect(prompt).toContain('preserve recurring identity');
    expect(prompt).toContain('Full carousel story for continuity and variation');
    expect(prompt).toContain('Do not default to a home-office desk');
  });

  it('chooses an original subject that fits the user topic when no reference is supplied', () => {
    const prompt = socialImagePagePrompt(
      {
        templateKey: 'EDITORIAL_COVER',
        headline: '投稿を続けるコツ',
        bodyLines: ['五枚の順番で迷いを減らす'],
      },
      false,
      0,
      5,
    );
    expect(prompt).toContain('cover: establish the one concrete topic and reader benefit');
    expect(prompt).toContain('Create fictional people, products and places');
    expect(prompt).toContain('do not add a person when the product, venue, tool or result');
    expect(prompt).not.toContain('same fictional Japanese adult professional');
  });

  it('uses the service brand color without forcing one generic visual style', () => {
    const prompt = socialImagePagePrompt(
      {
        templateKey: 'EDITORIAL_COVER',
        headline: '季節のランチを選ぶコツ',
        bodyLines: ['旬の食材を楽しむ'],
        accentColor: '#1C7A65',
        visualScene: '料理人が旬の野菜を盛り付ける厨房の寄り写真',
      },
      false,
      0,
      5,
    );
    expect(prompt).toContain('#1C7A65');
    expect(prompt).toContain('credible for this specific topic or industry');
    expect(prompt).not.toContain('warm cream, soft coral and muted lavender');
  });
});
