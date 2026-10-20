import { describe, expect, it } from 'vitest';
import { personalLearningNudgeDeliveryMessage } from '../src/services/personal-learning-nudge-message';

describe('N-2 LINE copy fallback', () => {
  it('uses the exact N-1 saved copy when admission or AI generation fails', () => {
    expect(
      personalLearningNudgeDeliveryMessage({
        generatedCopy: null,
        fixedCopy: '止まっていても大丈夫です。\nhttps://example.test/learning',
        learningUrl: 'https://example.test/learning',
      }),
    ).toEqual({
      text: '止まっていても大丈夫です。\nhttps://example.test/learning',
      copySource: 'FIXED_N1',
    });
  });

  it('uses the generated copy with the scoped learning link when available', () => {
    expect(
      personalLearningNudgeDeliveryMessage({
        generatedCopy: '今日は一歩だけ進めてみませんか？',
        fixedCopy: '固定文面',
        learningUrl: 'https://example.test/scoped-learning',
      }),
    ).toEqual({
      text: '今日は一歩だけ進めてみませんか？\nhttps://example.test/scoped-learning',
      copySource: 'AI_N2',
    });
  });
});
