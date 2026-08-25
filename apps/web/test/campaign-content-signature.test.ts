import { describe, expect, it } from 'vitest';
import { campaignContentSignature } from '../src/services/campaign-content-signature';

describe('campaign content signature', () => {
  it('normalizes superficial spacing and punctuation without retaining content', () => {
    const left = campaignContentSignature({ text: '今日は、これを紹介します。' });
    const right = campaignContentSignature({ text: '今日は これを紹介します' });
    expect(left).toEqual(right);
    expect(left.contentFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(left.simhash).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(left)).not.toContain('紹介します');
  });
});
