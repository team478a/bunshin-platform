import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = source('app/s/[serviceSlug]/activity/page.tsx');
const share = source('app/s/[serviceSlug]/activity/service-referral-share.tsx');
const endpoint = source('src/http/service-referral-code.ts');
const home = source('app/s/[serviceSlug]/home/page.tsx');

describe('service member activity and referral', () => {
  it('keeps referral code issuance inside the active service membership', () => {
    expect(endpoint).toContain('workspaceId: service.workspaceId');
    expect(endpoint).toContain('groupId: service.serviceId');
    expect(endpoint).toContain('userId: actor.userId');
    expect(endpoint).toContain("status: 'ACTIVE'");
    expect(endpoint).toContain('registration.referralEnabled');
    expect(endpoint).toContain('requireSameOrigin(request)');
  });

  it('shows only service-scoped referral, credit, and badge activity', () => {
    expect(page).toContain('groupMembershipId: membership.id');
    expect(page).toContain('referralCodeId: referralCode.id');
    expect(page).toContain('groupId: service.serviceId');
    expect(page).toContain('serviceCreditAccount.findFirst');
    expect(page).toContain('badgeAward.findMany');
    expect(page).toContain('badgeProgress.findMany');
    expect(page).not.toContain('referredUser');
  });

  it('offers simple copy, device share, LINE share, and QR actions', () => {
    expect(share).toContain('navigator.clipboard.writeText');
    expect(share).toContain('navigator.share');
    expect(share).toContain('https://line.me/R/share?text=');
    expect(share).toContain('QRコードを表示');
    expect(endpoint).toContain('QRCode.toDataURL');
  });

  it('links the shared activity view from every service home', () => {
    expect(home).toContain('/activity');
    expect(home).toContain('活動・紹介を見る');
    expect(page).toContain('registration.referralEnabled &&');
  });
});
