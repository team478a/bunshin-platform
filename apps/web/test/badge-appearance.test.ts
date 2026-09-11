import { describe, expect, it } from 'vitest';
import {
  BADGE_APPEARANCES,
  badgeAppearanceFromImageKey,
  badgeAppearanceImageKey,
} from '../src/badges/badge-appearance';

describe('badge appearance', () => {
  it('round-trips every operator-selectable appearance through the persisted image key', () => {
    for (const appearance of BADGE_APPEARANCES) {
      expect(badgeAppearanceFromImageKey(badgeAppearanceImageKey(appearance.key))).toEqual(
        appearance,
      );
    }
  });

  it('keeps existing badges readable and gives common activity badges useful marks', () => {
    expect(badgeAppearanceFromImageKey('badges/groups/group/helper.svg').key).toBe('STAR');
    expect(badgeAppearanceFromImageKey('badges/weekly_post_4.svg').key).toBe('FLAG');
    expect(badgeAppearanceFromImageKey('badges/view_streak_7.svg').key).toBe('TROPHY');
    expect(badgeAppearanceFromImageKey('badges/first_feedback.svg').key).toBe('HEART');
    expect(badgeAppearanceFromImageKey('badges/image_first.svg').key).toBe('SPARK');
  });
});
