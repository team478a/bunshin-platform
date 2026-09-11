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
  campaignId: null,
  classification: 'ORGANIC',
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
  selectedMemories: [
    {
      id: 'secret-memory-id',
      type: 'EXPERIENCE' as const,
      summary: '副業の経験',
      content: '毎日5分続けた',
      selectionReason: 'Missionとの関連語 2件・重要度 4/5',
    },
  ],
};

const contents: Record<SocialPreferredFormat, MissionContent> = {
  TEXT: {
    body: '本文',
    threadParts: [],
    cta: null,
    caption: null,
    hashtags: [],
    photoInstruction: null,
  },
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
    expect(payload).not.toContain('secret-memory-id');
    expect(payload).toContain('毎日5分続けた');
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

  it('keeps generated work within the mission brief time budget', async () => {
    const generator = {
      generate: vi.fn().mockResolvedValue({
        output: { ...contents.IMAGE, estimatedMinutes: 15 },
        model: 'gpt-5.2',
        promptVersion: 'v1',
        inputTokens: null,
        outputTokens: null,
        latencyMs: 1,
      }),
    };
    const result = await new GenerateMissionContent(generator).execute({
      ...context,
      platform: 'INSTAGRAM',
      brief: { ...brief, format: 'IMAGE', estimatedMinutes: 5 },
    });
    expect(result.output).toMatchObject({ estimatedMinutes: 5 });
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

  it('requires validated rewrite instructions with variant source content', async () => {
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
      variantSourceContent: contents.TEXT,
      variantInstructions: ['導入と構成を変える'],
    });
    expect(generator.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        variantSourceContent: contents.TEXT,
        variantInstructions: ['導入と構成を変える'],
      }),
    );
    await expect(
      new GenerateMissionContent(generator).execute({
        ...context,
        variantSourceContent: contents.TEXT,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
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
      selectedMemories: context.selectedMemories,
    });
    expect(result.output).toEqual({ verdict: 'PASS', score: 85, issues: [] });
    expect(JSON.stringify(checker.check.mock.calls[0]?.[0])).not.toContain('secret-id');
    expect(JSON.stringify(checker.check.mock.calls[0]?.[0])).toContain('毎日5分続けた');
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
      selectedMemories: context.selectedMemories,
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
      selectedMemories: context.selectedMemories,
    });
    expect(result.output).toEqual({ verdict: 'REVISE', score: 80, issues: [issue] });
  });

  it('returns a repairable result when image text would be cut off', async () => {
    const checker = {
      check: vi.fn().mockResolvedValue({
        output: { verdict: 'PASS', score: 95, issues: [] },
        model: 'gpt-5.2',
        promptVersion: 'v1',
        inputTokens: null,
        outputTokens: null,
        latencyMs: 1,
      }),
    };
    const result = await new CheckMissionQuality(checker).execute({
      ...context,
      platform: 'INSTAGRAM',
      brief: { ...brief, format: 'IMAGE' },
      content: {
        ...contents.IMAGE,
        slides: [
          {
            index: 1,
            role: 'HOOK',
            headline: '初心者でも今日から続けられる投稿づくりの始め方',
            body: '迷わず始める',
            visualScene: '店主が店頭で投稿案を見せる正面写真',
          },
          {
            index: 2,
            role: 'PROBLEM',
            headline: '毎回迷って止まる',
            body: '題材を決めるだけで時間を使います。',
            visualScene: '机で白紙を前に悩む店主を横から撮る',
          },
          {
            index: 3,
            role: 'INSIGHT',
            headline: '先に型を決める',
            body: '順番があると迷いが減ります。',
            visualScene: '五つの付箋を並べる手元を真上から撮る',
          },
          {
            index: 4,
            role: 'SOLUTION',
            headline: '一日一つ書く',
            body: 'お客様の質問を一つ選び答えます。',
            visualScene: '質問メモから投稿を書く手元を斜めから撮る',
          },
          {
            index: 5,
            role: 'CTA',
            headline: '今日一つ試す',
            body: 'この投稿を保存して始めましょう。',
            visualScene: '完成した投稿を見て笑顔になる店主の写真',
          },
        ],
      },
    });
    expect(result.output).toMatchObject({ verdict: 'REVISE', score: 84 });
    expect(result.output.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CAROUSEL_TEXT_TOO_LONG',
          field: 'slides.0.headline',
        }),
      ]),
    );
  });

  it('rejects repeated carousel messages, scenes and a missing final action', async () => {
    const checker = {
      check: vi.fn().mockResolvedValue({
        output: { verdict: 'PASS', score: 92, issues: [] },
        model: 'gpt-5.2',
        promptVersion: 'v1',
        inputTokens: null,
        outputTokens: null,
        latencyMs: 1,
      }),
    };
    const repeated = {
      headline: '投稿の迷いを減らす',
      body: '順番を決めると楽になります。',
      visualScene: '店主が机で五枚のカードを並べる写真',
    };
    const result = await new CheckMissionQuality(checker).execute({
      ...context,
      platform: 'INSTAGRAM',
      brief: { ...brief, format: 'IMAGE' },
      content: {
        ...contents.IMAGE,
        slides: [
          { index: 1, role: 'HOOK', ...repeated },
          { index: 2, role: 'PROBLEM', ...repeated },
          {
            index: 3,
            role: 'INSIGHT',
            headline: '原因を知る',
            body: '毎回ゼロから考えるためです。',
            visualScene: '白紙と予定表を真上から比較する写真',
          },
          {
            index: 4,
            role: 'SOLUTION',
            headline: '五つの順番を使う',
            body: '悩みから答えまで順に書きます。',
            visualScene: '投稿案を書き込む手元を横から撮る',
          },
          {
            index: 5,
            role: 'CTA',
            headline: 'これで安心',
            body: '投稿づくりが楽になります。',
            visualScene: '完成した五枚を机に広げた写真',
          },
        ],
      },
    });
    expect(result.output.verdict).toBe('REVISE');
    expect(result.output.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'CAROUSEL_DUPLICATE_MESSAGE',
        'REPEATED_VISUAL_SCENE',
        'CAROUSEL_NO_ACTION',
      ]),
    );
  });

  it.each([
    ['飲食店', '雨の日の来店を増やす', '入口の黒板を直す'],
    ['美容室', '次回予約を忘れさせない', '会計時に次回を決める'],
    ['工務店', '相談前の不安を減らす', '費用の内訳を見せる'],
  ])('accepts a complete five-page story for %s', async (_industry, topic, action) => {
    const checker = {
      check: vi.fn().mockResolvedValue({
        output: { verdict: 'PASS', score: 91, issues: [] },
        model: 'gpt-5.2',
        promptVersion: 'v1',
        inputTokens: null,
        outputTokens: null,
        latencyMs: 1,
      }),
    };
    const result = await new CheckMissionQuality(checker).execute({
      ...context,
      platform: 'INSTAGRAM',
      brief: { ...brief, format: 'IMAGE', topic },
      content: {
        ...contents.IMAGE,
        topic,
        slides: [
          {
            index: 1,
            role: 'HOOK',
            headline: topic,
            body: '今日できる工夫を紹介',
            visualScene: '店の入口と案内を見る正面写真',
          },
          {
            index: 2,
            role: 'PROBLEM',
            headline: 'お客様が迷っている',
            body: '必要な情報が見つからず不安になります。',
            visualScene: '案内を探すお客様を店内の横から撮る',
          },
          {
            index: 3,
            role: 'INSIGHT',
            headline: '原因は説明不足',
            body: '最初に知りたい答えが見えていません。',
            visualScene: '不足した案内と質問メモを真上から比べる',
          },
          {
            index: 4,
            role: 'SOLUTION',
            headline: action,
            body: 'よくある質問への答えを一つ明確に示します。',
            visualScene: 'スタッフが新しい案内を作る手元を斜めから撮る',
          },
          {
            index: 5,
            role: 'CTA',
            headline: '今日一つ試す',
            body: '保存して一つだけ直してみましょう。',
            visualScene: '改善した案内を見て安心するお客様の写真',
          },
        ],
      },
    });
    expect(result.output).toEqual({ verdict: 'PASS', score: 91, issues: [] });
  });
});
