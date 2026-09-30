import { describe, expect, it } from 'vitest';
import {
  copyOptions,
  imageCreationPrompt,
  imagePostHeadline,
  missionAssistanceOptions,
  missionGuide,
  missionWithSelectedVariant,
  type DailyMissionView,
} from '../app/(app)/bunshins/[bunshinId]/daily-mission-section';

function mission(
  format: DailyMissionView['format'],
  content: Record<string, unknown>,
): DailyMissionView {
  return {
    id: 'mission-1',
    missionDate: '2026-08-21',
    status: 'VIEWED',
    format,
    assistanceLevel: 'READY_TO_USE',
    estimatedMinutes: 5,
    topic: 'topic',
    angle: 'angle',
    reason: 'reason',
    campaignId: null,
    classification: 'ORGANIC',
    qualityScore: 90,
    content,
    decision: 'ACCEPTED',
    rejectionReason: null,
    platform: 'X',
    postedAt: null,
    feedback: null,
    trendContext: null,
    variants: [],
  };
}

describe('Daily Mission copy UX', () => {
  it.each(['SLIDE', 'IMAGE'] as const)(
    'corrects saved Sennokuni %s prompts and adds explicit LINE visual rules',
    (format) => {
      const original = mission(format, {
        overlayText: '加入：Discord参加',
        imageInstruction: 'Discordサーバーを開くスマートフォン',
        slides: [
          {
            headline: 'Discord参加',
            body: 'Discord招待リンク https://discord.gg/abc',
            visualScene: 'Discordチャンネルを開く',
          },
        ],
        caption: 'ディスコード参加 https://lin.ee/approved',
      });
      original.topic = 'Discord参加の案内';
      const options = copyOptions(original, 'sennokuni-media');
      const prompt = options.find(({ type }) => type === 'COPIED_IMAGE_INSTRUCTION')?.value ?? '';
      expect(prompt).toContain('投稿のテーマ：公式LINEから参加の案内');
      expect(prompt).toContain('見出し「公式LINEから参加」');
      expect(prompt).toContain('このページの場面「公式LINEを開く」');
      expect(prompt).toContain('参加窓口は公式LINE');
      expect(prompt).toContain('Discordのロゴ、画面、サーバー一覧、チャンネル一覧を画像に描かない');
      expect(prompt).not.toContain('https://discord');
      expect(prompt).not.toContain('Discord参加');
      expect(options.find(({ type }) => type === 'COPIED_TEXT')?.value).toBe(
        '公式LINEから参加 https://lin.ee/approved',
      );
      expect(imagePostHeadline(original, 'sennokuni-media')).toBe('加入：公式LINEから参加');
      expect(imageCreationPrompt(original, 'sennokuni-media')).toBe(prompt);
      expect(original.content['overlayText']).toBe('加入：Discord参加');
    },
  );

  it('adds the participation rule even when a saved prompt has no mention of any platform', () => {
    const input = mission('IMAGE', { caption: '千ノ国メディアに参加しよう' });
    expect(imageCreationPrompt(input, 'sennokuni-media')).toContain('参加窓口は公式LINE');
    expect(imageCreationPrompt(input)).not.toContain('参加窓口は公式LINE');
    expect(imageCreationPrompt(input, 'other-service')).toBe(imageCreationPrompt(input));
  });

  it('leaves personal and other-service Discord content unchanged', () => {
    const input = mission('TEXT', { body: 'Discord参加 https://discord.gg/other' });
    expect(copyOptions(input, 'other-service')).toEqual(copyOptions(input));
    expect(copyOptions(input)[0]?.value).toContain('Discord参加 https://discord.gg/other');
  });

  it('corrects selected variant content without modifying the variant', () => {
    const input = mission('TEXT', { body: '原案' });
    input.variants = [
      {
        id: 'variant',
        sequence: 1,
        content: { body: 'Discord参加' },
        qualityScore: 90,
        selectedAt: '2026-09-28T00:00:00.000Z',
      },
    ];
    expect(copyOptions(missionWithSelectedVariant(input), 'sennokuni-media')[0]?.value).toBe(
      '公式LINEから参加',
    );
    expect(input.variants[0]?.content['body']).toBe('Discord参加');
  });

  it('shows three plain Japanese assistance choices in increasing order', () => {
    expect(missionAssistanceOptions.map(({ label }) => label)).toEqual([
      '企画を見る',
      '作り方を見る',
      '完成版を見る',
    ]);
  });

  it('builds a safe guide without exposing the finished text', () => {
    const textMission = mission('TEXT', {
      body: '完成した投稿本文',
      threadParts: ['続き1', '続き2'],
      cta: 'CTA',
    });
    const guide = missionGuide(textMission);
    expect(guide).toHaveLength(3);
    expect(guide.join(' ')).not.toContain('完成した投稿本文');
    expect(guide.join(' ')).not.toContain('続き1');
  });

  it('provides a single combined TEXT copy action', () => {
    expect(
      copyOptions(
        mission('TEXT', {
          body: '本文',
          threadParts: ['続き1', '続き2'],
          cta: 'CTA',
        }),
      ),
    ).toEqual([
      {
        label: '投稿文をコピー',
        value: '本文\n\n続き1\n\n続き2\n\nCTA',
        type: 'COPIED_TEXT',
      },
    ]);
  });

  it('provides all-slides and per-slide actions without copying hidden data', () => {
    const options = copyOptions(
      mission('SLIDE', {
        slides: [
          { headline: '1枚目', body: '本文1' },
          { headline: '2枚目', body: '本文2', visualScene: 'お客様が商品を比べている場面' },
        ],
        internalNote: 'コピー禁止',
      }),
    );
    expect(options.map(({ label }) => label)).toEqual([
      '5枚の画像を作る文章をコピー',
      '全部コピー',
      '1枚目をコピー',
      '2枚目をコピー',
    ]);
    expect(options[0]?.value).not.toContain('コピー禁止');
    expect(options[0]?.value).toContain('1枚目：見出し「1枚目」／本文「本文1」');
    expect(options[0]?.value).toContain('このページの場面');
    expect(options[0]?.value).toContain('お客様が商品を比べている場面');
    expect(options[0]?.value).toContain('同じ写真や、ほぼ同じ構図を繰り返さない');
    expect(options[2]).toMatchObject({
      type: 'COPIED_SLIDE',
      metadata: { slideIndex: 1 },
    });
  });

  it.each([
    [
      'AI_VIDEO_PROMPT',
      { prompt: '動画Prompt', caption: '投稿文' },
      ['AI動画を作るための説明をコピー', '投稿文をコピー'],
    ],
    [
      'LIVE_ACTION',
      { script: [{ seconds: '0-3', text: 'フック' }], caption: '投稿文' },
      ['撮影台本をコピー', '投稿文をコピー'],
    ],
    [
      'IMAGE',
      { imageInstruction: '制作指示', caption: '投稿文' },
      ['画像を作るための説明をコピー', '投稿文をコピー'],
    ],
  ] as const)('provides the intended %s actions', (format, content, labels) => {
    expect(copyOptions(mission(format, content)).map(({ label }) => label)).toEqual(labels);
  });

  it('copies a content-ready image prompt separately from the caption', () => {
    const options = copyOptions(
      mission('IMAGE', {
        imageInstruction: '白い背景に青い円を置く',
        overlayText: '画像内の文字',
        caption: '投稿文',
        internalNote: 'コピー禁止',
      }),
    );

    expect(options[0]).toMatchObject({
      label: '画像を作るための説明をコピー',
      type: 'COPIED_IMAGE_INSTRUCTION',
    });
    expect(options[0]?.value).toContain('5枚で完結する投稿画像');
    expect(options[0]?.value).toContain('別画像として作ってください');
    expect(options[0]?.value).toContain('写真・イラストの内容：白い背景に青い円を置く');
    expect(options[0]?.value).toContain('「画像内の文字」');
    expect(options[0]?.value).toContain('2枚目（共感）');
    expect(options[0]?.value).toContain('5枚目（まとめ）');
    expect(options[0]?.value).toContain('内容を作る材料となる投稿文：投稿文');
    expect(options[0]?.value).toContain('私が「次」と送るたびに');
    expect(options[0]?.value).not.toContain('コピー禁止');
    expect(options[1]).toEqual({
      label: '投稿文をコピー',
      value: '投稿文',
      type: 'COPIED_TEXT',
    });
  });

  it('uses the mission topic as the image headline when overlay text is absent', () => {
    const [imagePrompt] = copyOptions(
      mission('IMAGE', {
        imageInstruction: '机の上のノートを写す',
        overlayText: null,
        caption: '投稿文',
      }),
    );

    expect(imagePrompt?.value).toContain('「topic」');
  });

  it('uses selected variant content for display and copy without overwriting the original', () => {
    const original = mission('TEXT', {
      body: '原案',
      threadParts: [],
      cta: null,
      caption: null,
      hashtags: [],
    });
    original.variants = [
      {
        id: 'variant-1',
        sequence: 1,
        content: {
          body: '選んだ別案',
          threadParts: [],
          cta: null,
          caption: null,
          hashtags: [],
        },
        qualityScore: 92,
        selectedAt: '2026-09-07T12:00:00.000Z',
      },
    ];
    const selected = missionWithSelectedVariant(original);
    expect(selected.content['body']).toBe('選んだ別案');
    expect(original.content['body']).toBe('原案');
    expect(copyOptions(selected)[0]?.value).toBe('選んだ別案');
  });
});
