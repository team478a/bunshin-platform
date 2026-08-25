import { describe, expect, it, vi } from 'vitest';
import {
  CheckMissionQuality,
  GenerateMissionContent,
  type DailyMissionBrief,
  type MissionContent,
  type SocialPreferredFormat,
} from '../src';

const brief: DailyMissionBrief = {
  missionDate: '2026-08-21',
  socialProfileId: 'profile-secret-id',
  weeklyPlanItemId: 'item-secret-id',
  format: 'TEXT',
  topic: '失敗から学んだ工夫',
  angle: '初心者が今日試せる',
  reason: '週間計画に合う',
  estimatedMinutes: 5,
};
const context = {
  platform: 'X' as const,
  brief,
  bunshin: {
    name: 'BUNSHIN',
    objectiveSummary: '継続',
    audienceSummary: '初心者',
    personalitySummary: '丁寧',
    personality: null,
  },
  approvedStrategy: {
    concept: '専門家型',
    positioning: '実践者',
    targetSummary: '初心者',
    ctaStrategy: 'プロフィール',
    postingPolicy: '平日',
  },
  contentPillar: { title: '実践', description: null },
  grantedKnowledge: [{ type: 'SKILL', title: '経験', content: '10年の経験' }],
};

const contents: Record<SocialPreferredFormat, MissionContent> = {
  TEXT: { body: '本文', threadParts: [], cta: null, caption: null, hashtags: [] },
  SLIDE: {
    topic: 'テーマ',
    angle: '切り口',
    reason: '理由',
    estimatedMinutes: 5,
    slides: [
      { index: 1, role: 'HOOK', headline: '表紙', body: '導入' },
      { index: 2, role: 'CTA', headline: '実行', body: '今日試す' },
    ],
    caption: '投稿文',
    hashtags: [],
  },
  LIVE_ACTION: {
    topic: 'テーマ',
    estimatedMinutes: 5,
    shootingInstruction: '縦向きで撮影',
    script: [
      { seconds: '0-3', role: 'HOOK', text: '導入' },
      { seconds: '4-15', role: 'CTA', text: '実行' },
    ],
    caption: '投稿文',
  },
  AI_VIDEO_PROMPT: {
    topic: 'テーマ',
    estimatedMinutes: 5,
    toolSuggestion: null,
    videoSettings: { aspectRatio: '9:16', durationSeconds: 15, style: 'シンプル' },
    prompt: '外部AI向けPrompt',
    overlayText: [],
    caption: '投稿文',
  },
  IMAGE: {
    topic: 'テーマ',
    angle: '切り口',
    reason: '理由',
    estimatedMinutes: 5,
    imageInstruction: '画像制作指示',
    overlayText: null,
    caption: '投稿文',
    hashtags: [],
  },
};
const platforms: Record<SocialPreferredFormat, typeof context.platform | 'INSTAGRAM'> = {
  TEXT: 'X',
  SLIDE: 'INSTAGRAM',
  LIVE_ACTION: 'INSTAGRAM',
  AI_VIDEO_PROMPT: 'INSTAGRAM',
  IMAGE: 'INSTAGRAM',
};

describe('GenerateMissionContent', () => {
  it.each(Object.entries(contents))('validates %s content', async (format, content) => {
    const generator = {
      generate: vi.fn().mockResolvedValue({
        output: content,
        model: 'gpt-5.2',
        promptVersion: 'mission-content-generator-v1',
        inputTokens: 10,
        outputTokens: 20,
        latencyMs: 30,
      }),
    };
    const result = await new GenerateMissionContent(generator).execute({
      ...context,
      platform: platforms[format as SocialPreferredFormat],
      brief: { ...brief, format: format as SocialPreferredFormat },
    });
    expect(result.output).toEqual(content);
    const payload = JSON.stringify(generator.generate.mock.calls[0]?.[0]);
    expect(payload).not.toContain('profile-secret-id');
    expect(payload).not.toContain('item-secret-id');
  });

  it('rejects incomplete generated content', async () => {
    const generator = {
      generate: vi.fn().mockResolvedValue({
        output: { body: '本文' },
        model: 'gpt-5.2',
        promptVersion: 'v1',
        inputTokens: null,
        outputTokens: null,
        latencyMs: 1,
      }),
    };
    await expect(new GenerateMissionContent(generator).execute(context)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects an unsupported platform and format before calling the provider', async () => {
    const generator = { generate: vi.fn() };
    await expect(
      new GenerateMissionContent(generator).execute({
        ...context,
        platform: 'YOUTUBE_SHORTS',
        brief: { ...brief, format: 'TEXT' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('passes only validated repair instructions to the provider', async () => {
    const generator = {
      generate: vi.fn().mockResolvedValue({
        output: contents.TEXT,
        model: 'gpt-5.2',
        promptVersion: 'v1',
        inputTokens: null,
        outputTokens: null,
        latencyMs: 1,
      }),
    };
    await new GenerateMissionContent(generator).execute({
      ...context,
      repairInstructions: ['本文を短くする'],
    });
    expect(generator.generate).toHaveBeenCalledWith(
      expect.objectContaining({ repairInstructions: ['本文を短くする'] }),
    );
  });
});

describe('CheckMissionQuality', () => {
  it('normalizes a passing result and removes trusted ids from provider input', async () => {
    const checker = {
      check: vi.fn().mockResolvedValue({
        output: { verdict: 'PASS', score: 85, issues: [] },
        model: 'gpt-5.2',
        promptVersion: 'mission-quality-checker-v1',
        inputTokens: 10,
        outputTokens: 10,
        latencyMs: 20,
      }),
    };
    const result = await new CheckMissionQuality(checker).execute({
      platform: context.platform,
      brief,
      content: contents.TEXT,
      bunshin: context.bunshin,
      approvedStrategy: context.approvedStrategy,
    });
    expect(result.output).toEqual({ verdict: 'PASS', score: 85, issues: [] });
    expect(JSON.stringify(checker.check.mock.calls[0]?.[0])).not.toContain('secret-id');
  });

  it('forces scores below 70 to fail even when provider approves', async () => {
    const checker = {
      check: vi.fn().mockResolvedValue({
        output: {
          verdict: 'PASS',
          score: 69,
          issues: [
            {
              code: 'FEASIBILITY',
              severity: 'ERROR',
              field: 'content',
              message: '改善が必要',
              repairInstruction: '短くする',
            },
          ],
        },
        model: 'gpt-5.2',
        promptVersion: 'v1',
        inputTokens: null,
        outputTokens: null,
        latencyMs: 1,
      }),
    };
    const result = await new CheckMissionQuality(checker).execute({
      platform: context.platform,
      brief,
      content: contents.TEXT,
      bunshin: context.bunshin,
      approvedStrategy: context.approvedStrategy,
    });
    expect(result.output.verdict).toBe('REJECT');
  });

  it('preserves a structured REVISE result for one repair attempt', async () => {
    const issue = {
      code: 'CTA_MISMATCH',
      severity: 'WARNING' as const,
      field: 'cta',
      message: 'CTA方針と異なる',
      repairInstruction: 'プロフィール誘導へ変更する',
    };
    const checker = {
      check: vi.fn().mockResolvedValue({
        output: { verdict: 'REVISE', score: 80, issues: [issue] },
        model: 'gpt-5.2',
        promptVersion: 'v1',
        inputTokens: null,
        outputTokens: null,
        latencyMs: 1,
      }),
    };
    const result = await new CheckMissionQuality(checker).execute({
      platform: context.platform,
      brief,
      content: contents.TEXT,
      bunshin: context.bunshin,
      approvedStrategy: context.approvedStrategy,
    });
    expect(result.output).toEqual({ verdict: 'REVISE', score: 80, issues: [issue] });
  });
});
