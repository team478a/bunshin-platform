import { describe, expect, it } from 'vitest';
import { assessFortuneQuality, fortuneFailureLabel } from '../src/fortune/quality';

describe('fortune operations quality', () => {
  it('does not treat standard readings as fallbacks while AI is disabled', () => {
    const result = assessFortuneQuality({
      aiEnabled: false,
      aiReadingCount: 0,
      basicReadingCount: 100,
      failedReadingCount: 0,
      staleGeneratingCount: 0,
    });
    expect(result.level).toBe('HEALTHY');
    expect(result.aiFallbackRate).toBeNull();
  });

  it('requests action for stale generation or a high AI fallback rate', () => {
    expect(
      assessFortuneQuality({
        aiEnabled: true,
        aiReadingCount: 4,
        basicReadingCount: 6,
        failedReadingCount: 0,
        staleGeneratingCount: 0,
      }).level,
    ).toBe('ACTION_REQUIRED');
    expect(
      assessFortuneQuality({
        aiEnabled: false,
        aiReadingCount: 0,
        basicReadingCount: 1,
        failedReadingCount: 0,
        staleGeneratingCount: 1,
      }).level,
    ).toBe('ACTION_REQUIRED');
  });

  it('shows a warning before failure rates become critical', () => {
    const result = assessFortuneQuality({
      aiEnabled: true,
      aiReadingCount: 8,
      basicReadingCount: 2,
      failedReadingCount: 0,
      staleGeneratingCount: 0,
    });
    expect(result.level).toBe('WATCH');
    expect(result.aiFallbackRate).toBe(0.2);
  });

  it('requests action when at least ten percent of attempts fail', () => {
    const result = assessFortuneQuality({
      aiEnabled: true,
      aiReadingCount: 9,
      basicReadingCount: 0,
      failedReadingCount: 1,
      staleGeneratingCount: 0,
    });
    expect(result.level).toBe('ACTION_REQUIRED');
    expect(result.failureRate).toBe(0.1);
  });

  it('uses safe Japanese labels instead of exposing internal failure codes', () => {
    expect(fortuneFailureLabel('AI_OUTPUT_REJECTED')).toContain('安全確認');
    expect(fortuneFailureLabel('UNKNOWN_PROVIDER_DETAIL')).not.toContain('UNKNOWN');
  });
});
