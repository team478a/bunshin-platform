import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const home = source('app/s/[serviceSlug]/home/page.tsx');
const activity = source('app/s/[serviceSlug]/activity/page.tsx');
const help = source('app/s/[serviceSlug]/help/page.tsx');
const points = source('app/(app)/points/page.tsx');
const badges = source('app/(app)/badges/page.tsx');

describe('rewards member guide', () => {
  it.each([home, activity])(
    'checks active rewards access inside the current service before showing the guide',
    (page) => {
      expect(page).toContain('getActiveRewardsPilotAccess');
      expect(page).toContain('groupId: service.serviceId');
      expect(page).toContain('userId: actor.userId');
    },
  );

  it('checks service-scoped rewards access for the signed-in help reader', () => {
    expect(help).toContain('getActiveRewardsPilotAccess');
    expect(help).toContain('groupId: service.serviceId');
    expect(help).toContain('userId: user.userId');
  });

  it('links selected members from the service home to their rewards summary', () => {
    expect(home).toContain('rewardsPilotAccess &&');
    expect(home).toContain('/activity#rewards');
    expect(home).toContain('ポイント・バッジを見る');
    expect(home).toContain('!rewardsPilotAccess &&');
  });

  it('keeps rewards data and guidance hidden outside the selected pilot', () => {
    expect(activity).toContain('? db.prisma.pointAccount.findFirst');
    expect(activity).toContain('? db.prisma.badgeAward.findMany');
    expect(activity).toContain('{rewardsPilotAccess && (');
  });

  it('gives phone users a short path to balances, history, and badge progress', () => {
    expect(activity).toContain('通常1分ほど待って、この画面を開き直す');
    expect(activity).toContain('ポイントの履歴を見る');
    expect(activity).toContain('バッジの進み具合を見る');
    expect(points).toContain('ポイントが増えるまで');
    expect(points).toContain('最近の履歴');
    expect(points).toContain('ポイントの使い道');
    expect(points).toContain('このページを見ただけではポイントは減りません');
    expect(points).toContain('あと ${option.pointsNeeded} WP たまると使えます');
    expect(points).toContain('今日の投稿案を開く');
    expect(badges).toContain('バッジが増えるまで');
  });

  it('shows only usable destinations from the active point catalog', () => {
    expect(points).toContain('ListPointRewardCatalog');
    expect(points).toContain('buildPointUseOptions');
    expect(points).toContain('PrismaGroupFeatureEntitlementRepository');
    expect(points).toContain("featureKey: 'SOCIAL.IMAGE_GENERATION'");
  });

  it('labels point earning methods that belong to an accepted campaign', () => {
    expect(points).toContain("method.campaignName ? `${method.campaignName}：` : ''");
    expect(points).toContain("`${method.campaignId ?? 'service'}:${method.ruleKey}`");
  });

  it('adds the same plain-language instructions to service help for eligible members', () => {
    expect(help).toContain('rewardsPilotAccess && <a href="#rewards">');
    expect(help).toContain('ポイントとバッジの確認方法');
    expect(help).toContain('同じ行動でもらえるポイントは原則1日1回です');
  });
});
