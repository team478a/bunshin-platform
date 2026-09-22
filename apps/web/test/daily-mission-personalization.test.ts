import { describe, expect, it } from 'vitest';
import type { SocialAccountStrategy, SocialProfile } from '@bunshin/capability-social';
import { buildMissionPersonalizationContext } from '../src/services/daily-mission-personalization';

const date = new Date('2026-09-22T00:00:00.000Z');
const profile = (platform: SocialProfile['platform'], purpose: string): SocialProfile => ({
  id: `profile-${platform}`,
  workspaceId: 'workspace-1',
  bunshinId: `bunshin-${platform}`,
  platform,
  handle: null,
  profileUrl: null,
  purpose,
  postingFrequency: 'DAILY',
  preferredFormats: platform === 'INSTAGRAM' ? ['SLIDE'] : ['TEXT'],
  defaultAssistanceLevel: 'READY_TO_USE',
  status: 'ACTIVE',
  createdAt: date,
  updatedAt: date,
});
const strategy = (socialProfile: SocialProfile, targetSummary: string): SocialAccountStrategy => ({
  id: `strategy-${socialProfile.platform}`,
  workspaceId: socialProfile.workspaceId,
  bunshinId: socialProfile.bunshinId,
  socialProfileId: socialProfile.id,
  platform: socialProfile.platform,
  goal: 'BRAND_AWARENESS',
  availableMinutes: 5,
  destinationType: 'PROFILE',
  destinationDetail: null,
  concept: targetSummary,
  positioning: `${targetSummary}へ実体験に基づく情報を届ける`,
  targetSummary,
  profileDraft: targetSummary,
  ctaStrategy: '保存を促す',
  postingPolicy: '根拠のある内容を一つ伝える',
  version: 1,
  status: 'APPROVED',
  approvedAt: date,
  supersededAt: null,
  createdAt: date,
  updatedAt: date,
});

describe('daily mission personalization context', () => {
  it.each([
    ['A', 'INSTAGRAM', '歴史を初めて学ぶ人へ写真で伝える', '歴史好きの初心者'],
    ['B', 'THREADS', 'ORIへの関心を文章で共有する', 'メタバース経験者'],
    ['C', 'INSTAGRAM', '店舗と経済圏の価値を発信する', 'SNS発信経験者'],
  ] as const)(
    '%s keeps user-specific evidence separate from shared knowledge',
    (_, platform, purpose, target) => {
      const socialProfile = profile(platform, purpose);
      const context = buildMissionPersonalizationContext({
        bunshin: {
          objectiveSummary: purpose,
          audienceSummary: target,
          personalitySummary: '分かりやすく丁寧に伝える',
        },
        socialProfile,
        strategy: strategy(socialProfile, target),
        onboardingContext: `経験: ${target}`,
        behaviorSummary: '直近の操作: ACCEPTED、POSTED',
      });
      expect(context.signals.map(({ type }) => type)).toEqual(
        expect.arrayContaining([
          'BUNSHIN_PROFILE',
          'SOCIAL_PROFILE',
          'ACCOUNT_STRATEGY',
          'ONBOARDING_RESPONSE',
          'RECENT_ACTIVITY',
        ]),
      );
      expect(context.signals.map(({ value }) => value).join('\n')).toContain(purpose);
      expect(context.signals.map(({ value }) => value).join('\n')).toContain(target);
      expect(context.instruction).toContain('ランダム化');
    },
  );
});
