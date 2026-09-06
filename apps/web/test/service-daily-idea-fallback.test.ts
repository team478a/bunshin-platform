import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

vi.mock('server-only', () => ({}));

import {
  buildServiceDailyIdeaFallback,
  shouldUseServiceDailyIdeaFallback,
} from '../src/services/service-daily-idea-fallback';

describe('service daily idea fallback', () => {
  it('builds a deterministic, non-guaranteeing idea from service business facts', () => {
    const first = buildServiceDailyIdeaFallback({
      missionDate: '2026-09-07',
      industry: '飲食',
      businessName: 'テスト食堂',
      productService: '日替わり定食',
      targetAudience: '近隣で働く人',
    });
    const second = buildServiceDailyIdeaFallback({
      missionDate: '2026-09-07',
      industry: '飲食',
      businessName: 'テスト食堂',
      productService: '日替わり定食',
      targetAudience: '近隣で働く人',
    });
    expect(first).toEqual(second);
    expect(first.body).toContain('効果を断定せず');
    expect(first.reason).toContain('business-daily-idea-fallback-v1');
  });

  it('falls back only for provider, quality and quota failures', () => {
    expect(
      shouldUseServiceDailyIdeaFallback(
        new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'provider unavailable'),
      ),
    ).toBe(true);
    expect(
      shouldUseServiceDailyIdeaFallback(
        new ApplicationError('FORBIDDEN', 'service monthly AI generation limit reached'),
      ),
    ).toBe(true);
    expect(
      shouldUseServiceDailyIdeaFallback(new ApplicationError('NOT_FOUND', 'profile missing')),
    ).toBe(false);
  });
});
