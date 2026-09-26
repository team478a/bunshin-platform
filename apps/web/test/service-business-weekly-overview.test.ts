import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL(
    '../app/s/[serviceSlug]/bunshins/[bunshinId]/service-bunshin-detail-view.tsx',
    import.meta.url,
  ),
  'utf8',
);
const overview = readFileSync(
  new URL(
    '../app/s/[serviceSlug]/bunshins/[bunshinId]/business-weekly-overview.tsx',
    import.meta.url,
  ),
  'utf8',
);

describe('business weekly overview', () => {
  it('is visible only in the business daily service flow', () => {
    expect(page).toContain('isBusinessDailyService ? (');
    expect(page).toContain('<BusinessWeeklyOverview');
    expect(page).toContain('plans={weeklyPlans}');
    expect(page).toContain('pillars={contentPillars}');
  });

  it('shows only confirmed current or upcoming plans in plain language', () => {
    expect(overview).toContain("plan.status === 'CONFIRMED'");
    expect(overview).toContain('これからの発信予定');
    expect(overview).toContain('予定は投稿パートナーが毎週準備します');
    expect(overview).toContain('次の予定を準備しています');
    expect(overview).toContain('今日の投稿案を見る');
    expect(overview).not.toContain('戦略');
  });

  it('emphasizes today and hides past items', () => {
    expect(overview).toContain('scheduledDate >= today');
    expect(overview).toContain("item.scheduledDate === today ? 'is-today'");
    expect(overview).toContain("item.scheduledDate === today ? '今日'");
  });
});
