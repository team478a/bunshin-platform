import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = [
  'service-bunshin-detail-data.ts',
  'service-bunshin-detail-business.ts',
  'service-bunshin-detail-view.tsx',
]
  .map((file) =>
    readFileSync(
      new URL(`../app/s/[serviceSlug]/bunshins/[bunshinId]/${file}`, import.meta.url),
      'utf8',
    ),
  )
  .join('\n');
const dailyAction = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/[bunshinId]/daily-action-section.tsx', import.meta.url),
  'utf8',
);

describe('business success pattern reuse', () => {
  it('passes the strongest business topic to the daily action flow', () => {
    expect(page).toContain('buildBusinessResponseInsight(input.dailyMissions).bestTopic');
    expect(page).toContain('suggestedReuseTopic={successfulBusinessTopic}');
  });

  it('prefills a plain-language improvement that mission generation can reuse', () => {
    expect(dailyAction).toContain('この投稿の型を次回も使う');
    expect(dailyAction).toContain("setSelected('POST_IMPROVEMENT')");
    expect(dailyAction).toContain('写真か最初の一言を変えてもう一度投稿する');
    expect(dailyAction).toContain("choice.type === 'POST_IMPROVEMENT' ? draftText : ''");
  });
});
