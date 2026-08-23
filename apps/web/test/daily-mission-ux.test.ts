import { describe, expect, it } from 'vitest';
import {
  copyOptions,
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
    estimatedMinutes: 5,
    topic: 'topic',
    angle: 'angle',
    reason: 'reason',
    qualityScore: 90,
    content,
    decision: 'ACCEPTED',
    rejectionReason: null,
    platform: 'X',
    postedAt: null,
    feedback: null,
  };
}

describe('Daily Mission copy UX', () => {
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
    ['IMAGE', { imageInstruction: '制作指示', caption: '投稿文' }, ['投稿文をコピー']],
  ] as const)('provides the intended %s actions', (format, content, labels) => {
    expect(copyOptions(mission(format, content)).map(({ label }) => label)).toEqual(labels);
  });
});
