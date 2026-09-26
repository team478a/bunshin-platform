import { describe, expect, it, vi } from 'vitest';
import type { SocialAccountStrategy, SocialProfile } from '@bunshin/capability-social';
import type { BunshinMemoryRepository } from '@bunshin/application';
import type { BunshinMemory } from '@bunshin/platform-domain';
import {
  buildDailyMissionPersonalizationBase,
  buildMissionPersonalizationContext,
  selectDailyMissionMemories,
} from '../src/services/daily-mission-personalization';

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
        feedbackSummary: '城跡の投稿はGOOD。売り込みの強い投稿は不採用。',
      });
      expect(context.signals.map(({ type }) => type)).toEqual(
        expect.arrayContaining([
          'BUNSHIN_PROFILE',
          'SOCIAL_PROFILE',
          'ACCOUNT_STRATEGY',
          'ONBOARDING_RESPONSE',
          'RECENT_ACTIVITY',
          'FEEDBACK_HISTORY',
        ]),
      );
      expect(context.signals.map(({ value }) => value).join('\n')).toContain(purpose);
      expect(context.signals.map(({ value }) => value).join('\n')).toContain(target);
      expect(context.instruction).toContain('ランダム化');
      expect(context.instruction).toContain('低評価・不採用理由を避け');
    },
  );

  it('builds prompt contexts from user evidence while keeping official knowledge authoritative', () => {
    const socialProfile = profile('INSTAGRAM', '歴史を初めて学ぶ人へ写真で伝える');
    const approvedStrategy = strategy(socialProfile, '歴史好きの初心者');
    const result = buildDailyMissionPersonalizationBase({
      bunshin: {
        name: '歴史案内人',
        objectiveSummary: '地域の歴史を伝える',
        audienceSummary: '歴史好きの初心者',
        personalitySummary: '分かりやすく丁寧に伝える',
      },
      personality: null,
      socialProfile,
      strategy: approvedStrategy,
      history: {
        businessProfile: null,
        onboardingContext: '城跡に興味がある',
        behaviorSummary: '直近は写真投稿を採用',
        feedbackSummary: '専門用語が多い投稿は不採用',
        performanceSummary: '地域の小話への反応が良い',
      },
      officialKnowledge: [{ type: 'SERVICE_FACT', title: '正式情報', content: 'ORIが正式名称' }],
      grantedKnowledge: [
        { type: 'OTHER', title: '個人知識', content: '公式情報がある場合は使わない' },
      ],
      personalMaterials: [
        { type: 'PERSONAL_MATERIAL', title: '本人素材', content: '昨日撮影した城跡' },
      ],
    });

    expect(result.bunshinContext.name).toBe('歴史案内人');
    expect(result.strategyContext.targetSummary).toBe('歴史好きの初心者');
    expect(result.knowledge).toEqual([
      { type: 'SERVICE_FACT', title: '正式情報', content: 'ORIが正式名称' },
      { type: 'PERSONAL_MATERIAL', title: '本人素材', content: '昨日撮影した城跡' },
    ]);
    expect(result.plannerPersonalization.signals.map(({ type }) => type)).toContain(
      'POST_PERFORMANCE',
    );
  });

  it('selects memories through the scoped repository and records the selection reason', async () => {
    const memory: BunshinMemory = {
      id: 'memory-1',
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      type: 'EXPERIENCE',
      content: '城跡を訪ねた経験',
      summary: '城跡巡り',
      sourceType: 'USER_INPUT',
      sourceId: 'daily-action:1',
      confidence: 1,
      importance: 5,
      active: true,
      deletedAt: null,
      createdAt: date,
      updatedAt: date,
    };
    const list = vi.fn().mockResolvedValue([memory]);
    const selected = await selectDailyMissionMemories({
      scope: { workspaceId: 'workspace-1', actorUserId: 'user-1', bunshinId: 'bunshin-1' },
      serviceSafeMode: false,
      allowServiceOwnerMemories: false,
      memoryRepository: { list } as unknown as BunshinMemoryRepository,
      ownerMemories: [memory],
      brief: { topic: '城跡', angle: '初心者向け', reason: '本人の興味と一致' },
      pillar: { title: '地域の歴史', description: '身近な史跡' },
      strategyTargetSummary: '歴史好きの初心者',
    });

    expect(list).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
      bunshinId: 'bunshin-1',
    });
    expect(selected[0]).toMatchObject({
      id: 'memory-1',
      summary: '城跡巡り',
      selectionReason: expect.stringContaining('関連語'),
    });
  });
});
