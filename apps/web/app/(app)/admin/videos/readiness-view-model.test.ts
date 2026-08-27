import { describe, expect, it } from 'vitest';
import type { AiProviderConfiguration, VideoDisclosurePolicy } from '@bunshin/application';
import { buildVideoReadiness } from './readiness-view-model';

const provider: AiProviderConfiguration = {
  id: '11111111-1111-4111-8111-111111111111',
  environment: 'PRODUCTION',
  provider: 'CREATOMATE',
  version: 1,
  status: 'ACTIVE',
  apiKeyConfigured: true,
  apiKeyMask: '••••1234',
  model: null,
  dailyBudgetUsdMicros: 1_000_000,
  monthlyBudgetUsdMicros: 10_000_000,
  globallyPaused: false,
  keyVersion: 1,
  lastVerifiedAt: new Date('2026-08-28T00:00:00Z'),
  lastErrorCategory: null,
  createdAt: new Date('2026-08-28T00:00:00Z'),
  updatedAt: new Date('2026-08-28T00:00:00Z'),
};

const policy = (platform: VideoDisclosurePolicy['platform']): VideoDisclosurePolicy => ({
  id: `${platform === 'INSTAGRAM' ? '1' : platform === 'TIKTOK' ? '2' : '3'}1111111-1111-4111-8111-111111111111`,
  environment: 'PRODUCTION',
  platform,
  version: 1,
  status: 'ACTIVE',
  disclosureText: 'AIを使って台本を作成しました。',
  hashtags: ['#AI活用'],
  guidance: '投稿前に表示を確認してください。',
  outputMetadata: {},
  changeReason: '初期設定のため',
  activationReason: '確認済みのため',
  createdAt: new Date('2026-08-28T00:00:00Z'),
  activatedAt: new Date('2026-08-28T00:00:00Z'),
  supersededAt: null,
});

describe('video readiness view model', () => {
  it('is ready only when the provider and every platform policy are ready', () => {
    expect(
      buildVideoReadiness({
        configurations: [provider],
        disclosurePolicies: [policy('INSTAGRAM'), policy('TIKTOK'), policy('YOUTUBE_SHORTS')],
      }),
    ).toMatchObject({ ready: true, blockerCount: 0 });
  });

  it('lists missing and paused settings as blockers', () => {
    const result = buildVideoReadiness({
      configurations: [{ ...provider, globallyPaused: true }],
      disclosurePolicies: [policy('INSTAGRAM')],
    });
    expect(result).toMatchObject({ ready: false, blockerCount: 3 });
    expect(result.items.filter((item) => !item.ready).map((item) => item.key)).toEqual([
      'CREATOMATE',
      'DISCLOSURE_TIKTOK',
      'DISCLOSURE_YOUTUBE_SHORTS',
    ]);
  });
});
