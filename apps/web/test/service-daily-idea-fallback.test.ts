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
    expect(first.photoInstruction).toContain('日替わり定食');
    expect(first.reason).toContain('business-daily-ready-fallback-v3');
  });

  it('changes both the post and image direction on consecutive delivery days', () => {
    const input = {
      industry: '情報発信',
      businessName: '千ノ国メディア',
      productService: '会員向け情報',
      targetAudience: '会員',
      businessFeatures: '分かりやすい情報を届けています',
      category: 'HELPFUL_EXPERTISE' as const,
    };
    const first = buildServiceDailyIdeaFallback({ ...input, missionDate: '2026-09-17' });
    const second = buildServiceDailyIdeaFallback({ ...input, missionDate: '2026-09-18' });
    const third = buildServiceDailyIdeaFallback({ ...input, missionDate: '2026-09-19' });

    expect(new Set([first.body, second.body, third.body]).size).toBe(3);
    expect(
      new Set([first.photoInstruction, second.photoInstruction, third.photoInstruction]).size,
    ).toBe(3);
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
