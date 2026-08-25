import { describe, expect, it } from 'vitest';
import {
  copyOptions,
  missionAssistanceOptions,
  missionGuide,
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
  };
}

describe('Daily Mission copy UX', () => {
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
          { headline: '2枚目', body: '本文2' },
        ],
        internalNote: 'コピー禁止',
      }),
    );
    expect(options.map(({ label }) => label)).toEqual([
      '全部コピー',
      '1枚目をコピー',
      '2枚目をコピー',
    ]);
    expect(options[0]?.value).not.toContain('コピー禁止');
    expect(options[1]).toMatchObject({
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

  it('copies only the image instruction and records it separately from the caption', () => {
    expect(
      copyOptions(
        mission('IMAGE', {
          imageInstruction: '白い背景に青い円を置く',
          overlayText: '画像内の文字',
          caption: '投稿文',
          internalNote: 'コピー禁止',
        }),
      ),
    ).toEqual([
      {
        label: '画像を作るための説明をコピー',
        value: '白い背景に青い円を置く',
        type: 'COPIED_IMAGE_INSTRUCTION',
      },
      { label: '投稿文をコピー', value: '投稿文', type: 'COPIED_TEXT' },
    ]);
  });
});
