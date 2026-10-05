import { describe, expect, it } from 'vitest';
import {
  defineLearningScopeResult,
  LEARNING_SCOPE_CLASSIFICATIONS,
  type LearningScopeResult,
} from '../src/index';

const receipt: LearningScopeResult = {
  classification: 'CONTENT_REQUEST',
  detectedClassifications: ['CONTENT_REQUEST'],
  ruleVersion: 'EXAMPLE_SCOPE_V1',
  reason: 'SUGGESTION_ONLY',
  requiresConfirmation: true,
  suggestedLearningIntent: '作り方を学ぶ',
};

describe('Learning Scope result contract', () => {
  it.each(LEARNING_SCOPE_CLASSIFICATIONS)(
    'accepts package-independent classification %s',
    (classification) => {
      expect(
        defineLearningScopeResult({
          ...receipt,
          classification,
          detectedClassifications: [classification],
          suggestedLearningIntent: null,
        }).classification,
      ).toBe(classification);
    },
  );
  it('represents unknown without inventing a seventh classification', () => {
    expect(
      defineLearningScopeResult({
        ...receipt,
        classification: null,
        detectedClassifications: [],
        suggestedLearningIntent: null,
      }).requiresConfirmation,
    ).toBe(true);
  });
  it('copies and freezes the receipt and deduplicates detected classifications', () => {
    const detected = ['CONTENT_REQUEST', 'CONTENT_REQUEST'] as const;
    const result = defineLearningScopeResult({ ...receipt, detectedClassifications: detected });
    expect(result.detectedClassifications).toEqual(['CONTENT_REQUEST']);
    expect(result.detectedClassifications).not.toBe(detected);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.detectedClassifications)).toBe(true);
  });
  it.each([
    { requiresConfirmation: false },
    { classification: 'CONSULTING', detectedClassifications: ['CONSULTING'] },
    { detectedClassifications: [] },
    { ruleVersion: '' },
    { reason: 'user free text' },
    { suggestedLearningIntent: ' ' },
    { suggestedLearningIntent: 'x'.repeat(301) },
    { classification: 'UNKNOWN' },
    { detectedClassifications: ['UNKNOWN'] },
  ])('rejects inconsistent receipt %j', (patch) => {
    expect(() =>
      defineLearningScopeResult({ ...receipt, ...patch } as LearningScopeResult),
    ).toThrow('invalid learning scope result');
  });
  it('requires confirmation for mixed or unknown receipts even without suggestions', () => {
    for (const classification of ['LEARNING', null] as const) {
      expect(() =>
        defineLearningScopeResult({
          ...receipt,
          classification,
          detectedClassifications: classification ? ['LEARNING', 'CONSULTING'] : [],
          requiresConfirmation: false,
          suggestedLearningIntent: null,
        }),
      ).toThrow();
    }
  });
});
