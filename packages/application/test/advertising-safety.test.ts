import { describe, expect, it } from 'vitest';
import { inspectAdvertisingContent } from '../src';

const material = {
  productPackVersionId: 'version-1',
  evidenceIds: ['evidence-1'],
  facts: { price: '1000円' },
  rules: [
    { type: 'REQUIRED_DISCLOSURE' as const, value: '提供：公式店', condition: null },
    { type: 'FORBIDDEN_EXPRESSION' as const, value: '必ず成功', condition: null },
  ],
};

describe('広告安全性の決定的検査', () => {
  it('PR表記、公式事実、本人根拠がそろえば通す', () => {
    expect(
      inspectAdvertisingContent({
        content: '#PR 提供：公式店 実際に試しました',
        classification: 'ADVERTISEMENT',
        evidenceRequirement: 'PERSONAL_EVIDENCE',
        officialClaims: { price: '1000円' },
        material,
      }),
    ).toMatchObject({ verdict: 'PASS', issueCodes: [] });
  });

  it('表記不足、事実不一致、禁止表現をすべて記録して止める', () => {
    const result = inspectAdvertisingContent({
      content: '必ず成功します',
      classification: 'ADVERTISEMENT',
      evidenceRequirement: 'NONE',
      officialClaims: { price: '無料' },
      material,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.issueCodes).toEqual(
      expect.arrayContaining([
        'OFFICIAL_FACT_MISMATCH',
        'FORBIDDEN_EXPRESSION',
        'REQUIRED_DISCLOSURE_MISSING',
      ]),
    );
  });
});
