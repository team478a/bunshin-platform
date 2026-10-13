import { describe, it, expect } from 'vitest';
import {
  parseStoredPersonalLearningEvidenceSubmission,
  validatePersonalLearningEvidenceReview,
  validatePersonalLearningEvidenceSubmission,
  validatePersonalLearningPracticeNote,
} from '../src/personal-learning-practice';
describe('practice self-report note', () => {
  it('accepts a short report without assigning completion or skills', () => {
    expect(() =>
      validatePersonalLearningPracticeNote('見出しを直せた。公開はまだしていない', 0),
    ).not.toThrow();
  });
  it.each([
    ['', 0],
    [' ', 0],
    ['報告 ', 0],
    ['a'.repeat(501), 0],
    ['報告', -1],
    ['報告', 1.5],
    ['報告', 1000],
  ] as const)('rejects invalid report/revision (%s, %s)', (text, revision) => {
    expect(() => validatePersonalLearningPracticeNote(text, revision)).toThrow();
  });
});

describe('personal learning evidence', () => {
  it('keeps submitted text distinct from a self-report and versions each attempt', () => {
    expect(() =>
      validatePersonalLearningEvidenceSubmission({
        kind: 'TEXT',
        content: '見出し案',
        expectedRevision: 0,
      }),
    ).not.toThrow();
    expect(() =>
      validatePersonalLearningEvidenceSubmission({
        kind: 'SELF_REPORT',
        content: '一か所直した',
        expectedRevision: 1,
      }),
    ).not.toThrow();
    expect(
      parseStoredPersonalLearningEvidenceSubmission(
        JSON.stringify({
          schemaVersion: 'PERSONAL_LEARNING_EVIDENCE_V1',
          kind: 'TEXT',
          content: '見出し案',
          candidateId: '11111111-1111-4111-8111-111111111111',
          materialVersion: 1,
          revision: 1,
        }),
      )?.revision,
    ).toBe(1);
  });
  it('rejects invalid evidence and never accepts a PASS or skill score as a review', () => {
    expect(() =>
      validatePersonalLearningEvidenceSubmission({
        kind: 'TEXT',
        content: 'x ',
        expectedRevision: 0,
      }),
    ).toThrow();
    expect(() =>
      validatePersonalLearningEvidenceSubmission({
        kind: 'TEXT',
        content: 'x',
        expectedRevision: 100,
      }),
    ).toThrow();
    expect(parseStoredPersonalLearningEvidenceSubmission('{"result":"PASS"}')).toBeNull();
    expect(
      validatePersonalLearningEvidenceReview({
        state: 'FOLLOW_UP',
        observed: [],
        notEstablished: ['まだ'],
        feedback: '確認しました',
        nextAction: '一文追加してください',
      }),
    ).toBe(true);
    expect(
      validatePersonalLearningEvidenceReview({
        state: 'PASS',
        skills: { businessApplication: 99 },
      }),
    ).toBe(false);
  });
});
