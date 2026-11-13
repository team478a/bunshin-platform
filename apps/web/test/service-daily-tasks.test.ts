import { describe, expect, it } from 'vitest';
import { buildServiceDailyTasks } from '../app/s/[serviceSlug]/manage/service-management-view-model';

describe('service daily tasks', () => {
  it('links the four daily tasks to existing management pages with counts', () => {
    const tasks = buildServiceDailyTasks({
      serviceSlug: 'company-a',
      participantCount: 5,
      overview: {
        publishedProductPackCount: 1,
        openCampaignCount: 1,
        pendingPostApprovalCount: 2,
        recent: { generated: 5, accepted: 3, copied: 2, postedSelfReported: 1 },
      },
    });
    expect(tasks.map(({ title }) => title)).toEqual([
      '参加者',
      '発信企画',
      '公式素材',
      '活動状況（直近7日）',
    ]);
    expect(tasks.flatMap(({ links }) => links.map(({ href }) => href))).toEqual([
      '/s/company-a/manage/members',
      '/s/company-a/manage/campaigns',
      '/s/company-a/manage/post-approvals',
      '/s/company-a/manage/product-packs',
      '/s/company-a/manage/campaigns',
    ]);
    expect(tasks[0]!.lines).toEqual(['利用中の参加者：5名']);
    expect(tasks[1]!.lines).toEqual(['募集中の企画：1件', '確認を待つ投稿案：2件']);
    expect(tasks[3]!.lines.join(' ')).toContain('投稿完了（本人申告） 1件');
  });

  it('shows links without zero counts when counts are unavailable', () => {
    const tasks = buildServiceDailyTasks({
      serviceSlug: 'company-a',
      participantCount: 5,
      overview: null,
    });
    expect(tasks.slice(1).every(({ lines }) => lines.length === 0)).toBe(true);
    expect(tasks.every(({ links }) => links.length > 0)).toBe(true);
  });
});
