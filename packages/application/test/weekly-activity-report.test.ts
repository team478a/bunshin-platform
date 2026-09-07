import { describe, expect, it } from 'vitest';
import {
  GetWeeklyActivityReport,
  weeklyActivityLineText,
  type WeeklyActivityReportRepository,
} from '../src';

const scope = {
  workspaceId: 'workspace-a',
  bunshinId: 'bunshin-a',
  actorUserId: 'user-a',
};

describe('weekly activity report', () => {
  it('counts each mission once per action and respects the member timezone', async () => {
    const repository: WeeklyActivityReportRepository = {
      read() {
        return Promise.resolve({
          activities: [
            {
              dailyMissionId: 'm1',
              type: 'CONFIRMED',
              occurredAt: new Date('2026-09-06T15:30:00Z'),
            },
            {
              dailyMissionId: 'm1',
              type: 'CONFIRMED',
              occurredAt: new Date('2026-09-07T01:00:00Z'),
            },
            {
              dailyMissionId: 'm1',
              type: 'COPIED_TEXT',
              occurredAt: new Date('2026-09-07T02:00:00Z'),
            },
            {
              dailyMissionId: 'm1',
              type: 'COPIED_SCRIPT',
              occurredAt: new Date('2026-09-07T03:00:00Z'),
            },
            { dailyMissionId: 'm2', type: 'RESTED', occurredAt: new Date('2026-09-13T14:59:00Z') },
            { dailyMissionId: 'old', type: 'RESTED', occurredAt: new Date('2026-09-06T14:59:00Z') },
          ],
          posts: [{ dailyMissionId: 'm1', postedAt: new Date('2026-09-08T00:00:00Z') }],
          dailyActions: [
            { id: 'a1', createdAt: new Date('2026-09-08T00:00:00Z') },
            { id: 'a2', createdAt: new Date('2026-09-13T15:00:00Z') },
          ],
          variantSelections: [
            { dailyMissionId: 'm1', selectedAt: new Date('2026-09-09T00:00:00Z') },
            { dailyMissionId: 'm1', selectedAt: new Date('2026-09-10T00:00:00Z') },
          ],
        });
      },
    };
    const result = await new GetWeeklyActivityReport(repository).execute({
      ...scope,
      weekStart: '2026-09-07',
      timezone: 'Asia/Tokyo',
    });
    expect(result).toMatchObject({
      weekEnd: '2026-09-13',
      confirmed: 1,
      copied: 1,
      posted: 1,
      rested: 1,
      materialsAdded: 1,
      variantsUsed: 1,
      totalActions: 6,
    });
  });

  it('does not return an empty report for an inaccessible scope', async () => {
    await expect(
      new GetWeeklyActivityReport({ read: () => Promise.resolve(null) }).execute({
        ...scope,
        weekStart: '2026-09-07',
        timezone: 'Asia/Tokyo',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('builds a LINE summary with counts and an HTTPS link only', () => {
    const text = weeklyActivityLineText(
      {
        weekStart: '2026-09-07',
        weekEnd: '2026-09-13',
        timezone: 'Asia/Tokyo',
        confirmed: 1,
        copied: 2,
        posted: 1,
        rested: 0,
        materialsAdded: 3,
        variantsUsed: 1,
        totalActions: 8,
        message: '1件の投稿が完了しました。来週も無理のないペースで続けましょう。',
      },
      'https://app.example.com/s/service/bunshins/bunshin-a?week=2026-09-07',
    );
    expect(text).toContain('投稿完了：1件');
    expect(text).toContain('素材追加：3件');
    expect(text).toContain('https://app.example.com/');
    expect(text).not.toContain('投稿本文');
    expect(text).not.toContain('Memory');
    expect(() => weeklyActivityLineText({} as never, 'http://app.example.com/report')).toThrow();
  });
});
