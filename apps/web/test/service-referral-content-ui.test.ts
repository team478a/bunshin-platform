import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shareSource = readFileSync(
  new URL('../app/s/[serviceSlug]/activity/service-referral-share.tsx', import.meta.url),
  'utf8',
);

describe('service referral content UI boundary', () => {
  it('requires an explicit user action and keeps posting manual', () => {
    expect(shareSource).toContain('紹介用の投稿文を作る');
    expect(shareSource).toContain('自動投稿はしません');
    expect(shareSource).toContain('createServiceReferralContent');
  });

  it('does not use the product tracking marker or an AI endpoint', () => {
    expect(shareSource).not.toContain('{{referral_url}}');
    expect(shareSource).not.toContain('/api/ai');
    expect(shareSource).not.toContain('/api/daily-missions');
  });
});
