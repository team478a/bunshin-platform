import { describe, expect, it } from 'vitest';
import type { MissionContent } from '@bunshin/capability-social';
import {
  inspectDailyMissionContent,
  recentMissionQualityContext,
} from '../src/services/daily-mission-content-quality';

const content = (body: string, photoInstruction = '机の上の商品を正面から撮ります。') =>
  ({
    body,
    threadParts: [],
    cta: '詳しくはプロフィールをご確認ください。',
    caption: body,
    hashtags: ['#千ノ国メディア'],
    photoInstruction,
  }) satisfies MissionContent;

describe('daily mission content quality', () => {
  it('rejects a creation instruction presented as a finished post', () => {
    const issue = inspectDailyMissionContent({
      content: content('お客様からよく聞かれる質問を一つ選び、短く答える内容です。'),
      recentMissions: [],
    });
    expect(issue?.code).toBe('INSTRUCTION_AS_POST');
  });

  it('rejects a fixed post whose date, heading, emoji and image direction alone changed', () => {
    const previous = content(
      '9月21日のご案内🌸\nORIでは、歴史を身近な言葉で学べることを大切にしています。\n詳しくはお問い合わせください。',
      '本を正面から撮ります。',
    );
    const candidate = content(
      '9月22日のご案内✨\nORIでは、歴史を身近な言葉で学べることを大切にしています。\n詳しくはお問い合わせください。',
      '本を斜め上から撮ります。',
    );
    expect(
      inspectDailyMissionContent({
        content: candidate,
        recentMissions: [
          { missionDate: '2026-09-21', topic: 'ORI', angle: '歴史', content: previous },
        ],
      })?.code,
    ).toBe('SUBSTANTIAL_RECENT_OVERLAP');
  });

  it('accepts a post that answers a different question with different concrete value', () => {
    const previous = content(
      '城跡を歩く前に、石垣の角を見てください。積み方の違いから修理された時代を考えられます。',
    );
    const candidate = content(
      '古文書の日付は旧暦です。季節の記述と照らすと、出来事が起きた頃の暮らしを想像しやすくなります。',
    );
    expect(
      inspectDailyMissionContent({
        content: candidate,
        recentMissions: [
          { missionDate: '2026-09-21', topic: '城跡', angle: '石垣', content: previous },
        ],
      }),
    ).toBeNull();
  });

  it('passes every presented draft to semantic quality review, regardless of posting status', () => {
    const context = recentMissionQualityContext([
      {
        id: 'not-posted',
        missionDate: '2026-09-20',
        topic: '未投稿でも提示済み',
        angle: '提示履歴',
        content: content('利用者へ表示した原稿です。投稿完了報告はありません。'),
      },
    ]);
    expect(context).toEqual([
      expect.objectContaining({
        missionDate: '2026-09-20',
        topic: '未投稿でも提示済み',
      }),
    ]);
  });
});
