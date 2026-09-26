import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = [
  'service-bunshin-detail-data.ts',
  'service-bunshin-detail-business.ts',
  'service-bunshin-detail-view.tsx',
]
  .map((file) =>
    readFileSync(
      new URL(`../app/s/[serviceSlug]/bunshins/[bunshinId]/${file}`, import.meta.url),
      'utf8',
    ),
  )
  .join('\n');
const guide = readFileSync(
  new URL(
    '../app/s/[serviceSlug]/bunshins/[bunshinId]/business-profile-guide.tsx',
    import.meta.url,
  ),
  'utf8',
);

describe('business SNS profile guide', () => {
  it('shows the latest approved strategy only for business daily services', () => {
    expect(page).toContain('const approvedBusinessStrategy = input.enabled');
    expect(page).toContain(".filter(({ status }) => status === 'APPROVED')");
    expect(page).toContain('right.version - left.version');
    expect(page).toContain('<BusinessProfileGuide');
    expect(page).toContain('profileDraft: approvedBusinessStrategy.profileDraft');
    expect(page).toContain('ctaStrategy: approvedBusinessStrategy.ctaStrategy');
    expect(page).toContain('socialProfileId: approvedBusinessStrategy.socialProfileId');
  });

  it('lets members choose and save a real customer destination', () => {
    expect(guide).toContain('お客様の案内先を設定・変更する');
    expect(guide).toContain('LINEへ案内する');
    expect(guide).toContain('予約・案内ページへ案内する');
    expect(guide).toContain('問い合わせページへ案内する');
    expect(guide).toContain("url.protocol !== 'https:'");
    expect(guide).toContain('fetch(`${base}/generate`');
    expect(guide).toContain('/approve`');
    expect(guide).toContain('router.refresh()');
  });

  it('gives members plain mobile instructions and copy buttons', () => {
    expect(guide).toContain('SNSの自己紹介文を入れましょう');
    expect(guide).toContain('プロフィールを編集');
    expect(guide).toContain('自己紹介文をコピー');
    expect(guide).toContain('案内文をコピー');
    expect(guide).not.toContain('CTA');
  });

  it('supports copy fallback in LINE and iPhone browsers', () => {
    expect(guide).toContain('navigator.clipboard.writeText');
    expect(guide).toContain("document.execCommand('copy')");
    expect(guide).toContain('文章を長押しして「コピー」');
  });
});
