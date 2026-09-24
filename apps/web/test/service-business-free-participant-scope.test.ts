import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const home = source('app/s/[serviceSlug]/home/page.tsx');
const detail = [
  'app/s/[serviceSlug]/bunshins/[bunshinId]/service-bunshin-detail-data.ts',
  'app/s/[serviceSlug]/bunshins/[bunshinId]/service-bunshin-detail-view.tsx',
]
  .map(source)
  .join('\n');
const missionSection = [
  'service-daily-mission-section.tsx',
  'service-daily-mission-controller.ts',
  'service-daily-mission-list.tsx',
]
  .map((file) => source(`app/s/[serviceSlug]/bunshins/[bunshinId]/${file}`))
  .join('\n');
const activity = source('app/s/[serviceSlug]/activity/page.tsx');
const help = source('app/s/[serviceSlug]/help/page.tsx');

describe('business free participant scope', () => {
  it('keeps the member home focused on daily posting', () => {
    expect(home).toContain('const isBusinessDailyService = onboarding.businessProfileEnabled');
    expect(home).toContain("isBusinessDailyService ? '毎日の集客を進める' : '利用できる機能'");
    expect(home).toContain('!isBusinessDailyService && (');
    expect(home).toContain('活動・紹介を見る');
    expect(home).toContain('参加中のプログラムと目標');
    expect(home).toContain('画像作成回数を見る');
  });

  it('does not load paid media, rewards, or external links into business daily missions', () => {
    expect(detail).toContain('const isBusinessDailyService = onboarding.businessProfileEnabled');
    expect(detail).toContain('const videoProjects = isBusinessDailyService');
    expect(detail).toContain('variantPointCost = isBusinessDailyService');
    expect(detail).toContain('!isBusinessDailyService && mission.linkUsage');
    expect(detail).toContain('variants: isBusinessDailyService');
    expect(detail).toContain('isBusinessDailyService || promptOnlyImages');
    expect(detail).toContain('bunshin.ownerUserId === actor.userId ? (');
    expect(detail).not.toContain('!isBusinessDailyService && bunshin.ownerUserId === actor.userId');
    expect(missionSection).toContain('active && variantPointCost !== null');
  });

  it('redirects stale activity links and hides unrelated help sections', () => {
    expect(activity).toContain('if (onboarding.businessProfileEnabled)');
    expect(activity).toContain('redirect(`/s/${serviceSlug}/weekly-report` as Route)');
    expect(help).toContain('{!isBusinessDailyService && <a href="#media">画像・動画</a>}');
    expect(help).toContain('{!isBusinessDailyService && rewardsPilotAccess && (');
    expect(help).toContain('お届けする内容：完成した投稿文');
    expect(help).toContain('採用した投稿文をコピーし、必要なところだけ直します。');
  });
});
