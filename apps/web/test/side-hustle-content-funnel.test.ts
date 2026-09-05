import { describe, expect, it } from 'vitest';
import { buildSideHustleContentFunnel } from '../src/services/side-hustle-content-funnel';

describe('side-hustle content funnel', () => {
  it('keeps the operational stages in action order', () => {
    const result = buildSideHustleContentFunnel({
      productMissions: 8,
      linkedMissions: 6,
      copiedMissions: 4,
      postedMissions: 3,
    });
    expect(result.stages.map((stage) => [stage.label, stage.count])).toEqual([
      ['商品投稿案', 8],
      ['専用URL付き', 6],
      ['コピー', 4],
      ['投稿完了', 3],
    ]);
    expect(result.missingLinkWarning).toBeNull();
  });

  it('warns when product missions have no measurable URL', () => {
    const result = buildSideHustleContentFunnel({
      productMissions: 2,
      linkedMissions: 0,
      copiedMissions: 0,
      postedMissions: 0,
    });
    expect(result.missingLinkWarning).toContain('専用URL付きの投稿案がありません');
  });
});
