import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

vi.mock('server-only', () => ({}));

import {
  buildServiceDailyIdeaFallback,
  shouldUseServiceDailyIdeaFallback,
} from '../src/services/service-daily-idea-fallback';

describe('service daily idea fallback', () => {
  it('builds a deterministic ready-to-post fallback from service business facts', () => {
    const first = buildServiceDailyIdeaFallback({
      missionDate: '2026-09-07',
      industry: '飲食',
      businessName: 'テスト食堂',
      productService: '日替わり定食',
      targetAudience: '近隣で働く人',
      businessFeatures: '毎朝仕込んだ料理を提供しています',
      category: 'HELPFUL_EXPERTISE',
    });
    const second = buildServiceDailyIdeaFallback({
      missionDate: '2026-09-07',
      industry: '飲食',
      businessName: 'テスト食堂',
      productService: '日替わり定食',
      targetAudience: '近隣で働く人',
      businessFeatures: '毎朝仕込んだ料理を提供しています',
      category: 'HELPFUL_EXPERTISE',
    });
    expect(first).toEqual(second);
    expect(first.body).toContain('毎朝仕込んだ料理を提供しています');
    expect(first.body).not.toContain('紹介しましょう');
    expect(first.hashtags).toEqual(['#テスト食堂', '#飲食', '#日替わり定食']);
    expect(first.photoInstruction).toContain('明るい場所で正面から撮ります');
    expect(first.reason).toContain('business-daily-ready-fallback-v2');
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
