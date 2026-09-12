import { describe, expect, it } from 'vitest';
import { buildPointUseOptions } from '../src/rewards/point-use-options';

const catalog = [
  {
    id: 'variant',
    rewardKey: 'ALTERNATIVE_PLAN_GENERATION',
    version: 1,
    rewardType: 'ALTERNATIVE_PLAN_GENERATION' as const,
    title: '別の企画を1回作る',
    description: '今日の企画とは違う案を1回作れます。',
    pointCost: 30,
  },
  {
    id: 'image',
    rewardKey: 'SOCIAL_IMAGE_GENERATION',
    version: 1,
    rewardType: 'SOCIAL_IMAGE_GENERATION' as const,
    title: '投稿用の画像を1回作る',
    description: '投稿内容に合う画像を1回作れます。',
    pointCost: 50,
  },
];

describe('point use options', () => {
  it('shows only active catalog items that have a usable destination', () => {
    expect(
      buildPointUseOptions({
        catalog,
        availablePoints: 30,
        destinations: {
          ALTERNATIVE_PLAN_GENERATION: {
            href: '/s/service/bunshins/member#today-post',
            actionLabel: '今日の投稿案を開く',
          },
        },
      }),
    ).toEqual([
      expect.objectContaining({
        id: 'variant',
        href: '/s/service/bunshins/member#today-post',
        actionLabel: '今日の投稿案を開く',
        pointsNeeded: 0,
      }),
    ]);
  });

  it('calculates the remaining points without producing a negative value', () => {
    const destinations = {
      ALTERNATIVE_PLAN_GENERATION: { href: '/today', actionLabel: '投稿案を開く' },
      SOCIAL_IMAGE_GENERATION: { href: '/images', actionLabel: '画像作成を開く' },
    } as const;

    expect(buildPointUseOptions({ catalog, availablePoints: 42, destinations })).toEqual([
      expect.objectContaining({ id: 'variant', pointsNeeded: 0 }),
      expect.objectContaining({ id: 'image', pointsNeeded: 8 }),
    ]);
  });
});
