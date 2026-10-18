import { describe, expect, it } from 'vitest';
import {
  isPersonalLearningPersonaInferredKey,
  isPersonalLearningPersonaValueDisallowed,
  PERSONAL_LEARNING_PERSONA_INFERRED_KEYS,
} from '../src';

describe('personal learning persona policy', () => {
  it('allows only the five learning-related inference keys', () => {
    expect(PERSONAL_LEARNING_PERSONA_INFERRED_KEYS).toHaveLength(5);
    for (const key of PERSONAL_LEARNING_PERSONA_INFERRED_KEYS) {
      expect(isPersonalLearningPersonaInferredKey(key)).toBe(true);
    }
    expect(isPersonalLearningPersonaInferredKey('company_name')).toBe(false);
    expect(isPersonalLearningPersonaInferredKey('medical_diagnosis')).toBe(false);
    expect(isPersonalLearningPersonaInferredKey('arbitrary')).toBe(false);
  });

  it.each([
    '私は糖尿病と診断されました',
    '同僚の田中さんはChatGPTが得意です',
    '東京都渋谷区1丁目2番地',
    '090-1234-5678',
    'learner@example.com',
  ])('rejects sensitive or third-party-looking value: %s', (value) => {
    expect(isPersonalLearningPersonaValueDisallowed(value)).toBe(true);
  });

  it('keeps ordinary learning preferences', () => {
    expect(isPersonalLearningPersonaValueDisallowed('短い手順を、平日の夜に少しずつ学びたい')).toBe(
      false,
    );
  });
});
