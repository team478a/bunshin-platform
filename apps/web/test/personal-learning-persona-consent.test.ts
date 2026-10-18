import { describe, expect, it } from 'vitest';
import {
  PERSONAL_LEARNING_PERSONA_CONSENT_VERSION,
  personalLearningPersonaInvitationAnswerCount,
} from '../src/services/personal-learning-persona-consent';

describe('persona consent configuration', () => {
  it('uses the reviewed consent version and defaults invitation to three saved answers', () => {
    expect(PERSONAL_LEARNING_PERSONA_CONSENT_VERSION).toBe('2026-10-18-v1');
    expect(personalLearningPersonaInvitationAnswerCount('')).toBe(3);
  });

  it('supports a bounded operator setting and falls back safely when it is invalid', () => {
    expect(personalLearningPersonaInvitationAnswerCount('5')).toBe(5);
    expect(personalLearningPersonaInvitationAnswerCount('0')).toBe(3);
    expect(personalLearningPersonaInvitationAnswerCount('101')).toBe(3);
    expect(personalLearningPersonaInvitationAnswerCount('not-a-number')).toBe(3);
  });
});
