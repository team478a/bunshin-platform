import { describe, expect, it } from 'vitest';
import { buildFortuneOperationalValidation } from '../src/fortune/operational-validation';
import type { FortuneOperationsQuality, FortuneOperatorStatus } from '../src/fortune/operator';

const status = {
  enabled: true,
  registeredParticipants: 1,
} satisfies Pick<FortuneOperatorStatus, 'enabled' | 'registeredParticipants'>;

const quality = {
  readingCount: 1,
  viewedReaders: 1,
  feedbackCount: 0,
} as FortuneOperationsQuality;

describe('fortune operational validation', () => {
  it('requires the real registration, reading and viewing flow after publication', () => {
    const result = buildFortuneOperationalValidation('daily-fortune', status, quality);
    expect(result.ready).toBe(true);
    expect(result.requiredComplete).toBe(4);
    expect(result.requiredTotal).toBe(4);
    expect(result.items.map(({ key, complete }) => [key, complete])).toEqual([
      ['PUBLICATION', true],
      ['REGISTRATION', true],
      ['READING', true],
      ['VIEWING', true],
      ['FEEDBACK', false],
    ]);
  });

  it('does not treat configuration alone as successful operation', () => {
    const result = buildFortuneOperationalValidation(
      'daily-fortune',
      { enabled: true, registeredParticipants: 0 },
      null,
    );
    expect(result.ready).toBe(false);
    expect(result.requiredComplete).toBe(1);
    expect(result.items.find(({ key }) => key === 'REGISTRATION')?.href).toBe('/s/daily-fortune');
  });

  it('keeps feedback recommended so the initial launch is not blocked', () => {
    const withoutFeedback = buildFortuneOperationalValidation('daily-fortune', status, quality);
    const withFeedback = buildFortuneOperationalValidation('daily-fortune', status, {
      ...quality,
      feedbackCount: 1,
    });
    expect(withoutFeedback.ready).toBe(true);
    expect(withoutFeedback.recommendedComplete).toBe(0);
    expect(withFeedback.recommendedComplete).toBe(1);
  });
});
